"""Profit-gated, bounded worker lifecycle manager."""
from __future__ import annotations
import argparse, hashlib, hmac, json, os, sqlite3, sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

DEFAULT_DB = os.environ.get("FACELESSREELS_DB", "data/facelessreels.sqlite3")
DEFAULT_TARGET = Decimal(os.environ.get("FACELESSREELS_PROFIT_TARGET_USD", "5.00"))
MAX_WORKERS = max(1, int(os.environ.get("FACELESSREELS_MAX_WORKERS", "3")))
MAX_GENERATIONS = max(0, int(os.environ.get("FACELESSREELS_MAX_GENERATIONS", "2")))

def utc_now(): return datetime.now(timezone.utc)
def iso_utc(value=None): return (value or utc_now()).astimezone(timezone.utc).isoformat()
def money(value):
    try: amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc: raise ValueError("amount must be a valid decimal number") from exc
    if not amount.is_finite() or amount < 0: raise ValueError("amount must be finite and non-negative")
    return amount.quantize(Decimal("0.01"))
def connect(db_path=DEFAULT_DB):
    path = Path(db_path)
    if str(path) != ":memory:": path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path)); db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db
def init_db(db_path=DEFAULT_DB):
    with connect(db_path) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('income','cost')),source TEXT NOT NULL,source_ref TEXT NOT NULL UNIQUE,amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),currency TEXT NOT NULL CHECK(currency='USD'),verified INTEGER NOT NULL CHECK(verified IN (0,1)),occurred_at TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS workers(id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER REFERENCES workers(id),generation INTEGER NOT NULL CHECK(generation>=0),status TEXT NOT NULL CHECK(status IN ('active','stopped')),created_at TEXT NOT NULL,stopped_at TEXT,reason TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS evaluations(id INTEGER PRIMARY KEY AUTOINCREMENT,evaluated_at TEXT NOT NULL,window_start TEXT NOT NULL,window_end TEXT NOT NULL,revenue_cents INTEGER NOT NULL,cost_cents INTEGER NOT NULL,net_cents INTEGER NOT NULL,target_cents INTEGER NOT NULL,outcome TEXT NOT NULL,worker_id INTEGER REFERENCES workers(id));
        """)
        if not db.execute("SELECT 1 FROM workers LIMIT 1").fetchone():
            db.execute("INSERT INTO workers(parent_id,generation,status,created_at,reason) VALUES(NULL,0,'active',?,?)",(iso_utc(),"initial worker"))
def canonical_event(event):
    fields = {k:v for k,v in event.items() if k != "signature"}
    return json.dumps(fields,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
def verify_revenue_event(event,secret=None):
    secret = secret if secret is not None else os.environ.get("FACELESSREELS_REVENUE_HMAC_KEY")
    if not secret or len(secret)<24: raise ValueError("FACELESSREELS_REVENUE_HMAC_KEY must be configured with at least 24 characters")
    if event.get("kind")!="income" or event.get("currency")!="USD": raise ValueError("only income events denominated in USD are accepted")
    source,ref = str(event.get("source","")).strip(),str(event.get("source_ref","")).strip()
    if not source or not ref: raise ValueError("source and source_ref are required")
    amount=money(event.get("amount"))
    if amount<=0: raise ValueError("income amount must be greater than zero")
    expected=hmac.new(secret.encode(),canonical_event(event),hashlib.sha256).hexdigest()
    if not event.get("signature") or not hmac.compare_digest(str(event["signature"]).lower(),expected): raise ValueError("revenue event signature is invalid")
    timestamp=event.get("timestamp") or iso_utc()
    try:
        parsed=datetime.fromisoformat(str(timestamp).replace("Z","+00:00"))
        if parsed.tzinfo is None: raise ValueError
        timestamp=parsed.astimezone(timezone.utc).isoformat()
    except (TypeError,ValueError) as exc: raise ValueError("timestamp must be ISO-8601 with timezone") from exc
    return amount,source,ref,timestamp
def record_revenue(event,db_path=DEFAULT_DB,secret=None):
    amount,source,ref,occurred=verify_revenue_event(event,secret); init_db(db_path)
    with connect(db_path) as db:
        db.execute("INSERT INTO ledger(kind,source,source_ref,amount_cents,currency,verified,occurred_at,created_at) VALUES('income',?,?,?,'USD',1,?,?)",(source,ref,int(amount*100),occurred,iso_utc()))
def record_cost(amount,source,source_ref,db_path=DEFAULT_DB):
    value=money(amount)
    if value<=0: raise ValueError("cost amount must be greater than zero")
    if not source.strip() or not source_ref.strip(): raise ValueError("source and source_ref are required")
    init_db(db_path)
    with connect(db_path) as db:
        db.execute("INSERT INTO ledger(kind,source,source_ref,amount_cents,currency,verified,occurred_at,created_at) VALUES('cost',?,?,?,'USD',1,?,?)",(source.strip(),source_ref.strip(),int(value*100),iso_utc(),iso_utc()))
def evaluate(db_path=DEFAULT_DB,target=DEFAULT_TARGET,max_workers=MAX_WORKERS,max_generations=MAX_GENERATIONS,now=None):
    target=money(target)
    if target<=0: raise ValueError("profit target must be greater than zero")
    if max_workers<1 or max_generations<0: raise ValueError("worker limit must be >= 1 and generation limit >= 0")
    init_db(db_path); end=now or utc_now()
    if end.tzinfo is None: raise ValueError("evaluation time must include a timezone")
    end=end.astimezone(timezone.utc); start=end-timedelta(hours=24)
    with connect(db_path) as db:
        row=db.execute("""SELECT COALESCE(SUM(CASE WHEN kind='income' AND verified=1 THEN amount_cents ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN kind='cost' THEN amount_cents ELSE 0 END),0) costs FROM ledger WHERE occurred_at>=? AND occurred_at<=? AND currency='USD'""",(start.isoformat(),end.isoformat())).fetchone()
        revenue,costs=int(row["revenue"]),int(row["costs"]); net=revenue-costs
        active=db.execute("SELECT * FROM workers WHERE status='active' ORDER BY id").fetchall()
        worker_id=None
        if net>=int(target*100):
            count=int(db.execute("SELECT COUNT(*) FROM workers").fetchone()[0])
            eligible=[w for w in active if int(w["generation"])<max_generations]
            if count<max_workers and eligible:
                parent=eligible[-1]; reason="bounded clone after net profit $"+f"{net/100:.2f}"
                cur=db.execute("INSERT INTO workers(parent_id,generation,status,created_at,reason) VALUES(?,?, 'active', ?,?)",(parent["id"],int(parent["generation"])+1,end.isoformat(),reason))
                worker_id=int(cur.lastrowid); outcome="target_met_clone_created"
            else: outcome="target_met_limits_reached"
        else:
            db.execute("UPDATE workers SET status='stopped',stopped_at=?,reason='net profit below target; controlled shutdown' WHERE status='active'",(end.isoformat(),))
            outcome="target_missed_workers_stopped"
        db.execute("INSERT INTO evaluations(evaluated_at,window_start,window_end,revenue_cents,cost_cents,net_cents,target_cents,outcome,worker_id) VALUES(?,?,?,?,?,?,?,?,?)",(end.isoformat(),start.isoformat(),end.isoformat(),revenue,costs,net,int(target*100),outcome,worker_id))
    return {"window_start":start.isoformat(),"window_end":end.isoformat(),"revenue_usd":f"{revenue/100:.2f}","costs_usd":f"{costs/100:.2f}","net_profit_usd":f"{net/100:.2f}","target_usd":f"{target:.2f}","outcome":outcome,"new_worker_id":worker_id}
def status(db_path=DEFAULT_DB):
    init_db(db_path)
    with connect(db_path) as db:
        workers=[dict(r) for r in db.execute("SELECT * FROM workers ORDER BY id")]
        latest=db.execute("SELECT * FROM evaluations ORDER BY id DESC LIMIT 1").fetchone()
        totals=db.execute("""SELECT COALESCE(SUM(CASE WHEN kind='income' AND verified=1 THEN amount_cents ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN kind='cost' THEN amount_cents ELSE 0 END),0) costs FROM ledger WHERE occurred_at>=? AND occurred_at<=?""",((utc_now()-timedelta(hours=24)).isoformat(),iso_utc())).fetchone()
        return {"workers":workers,"last_evaluation":dict(latest) if latest else None,"rolling_24h_revenue_usd":f"{int(totals['income'])/100:.2f}","rolling_24h_costs_usd":f"{int(totals['costs'])/100:.2f}","rolling_24h_net_usd":f"{(int(totals['income'])-int(totals['costs']))/100:.2f}"}
def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--db",default=DEFAULT_DB)
    sub=parser.add_subparsers(dest="command",required=True); sub.add_parser("init"); sub.add_parser("status")
    ev=sub.add_parser("evaluate"); ev.add_argument("--target",default=str(DEFAULT_TARGET)); ev.add_argument("--max-workers",type=int,default=MAX_WORKERS); ev.add_argument("--max-generations",type=int,default=MAX_GENERATIONS)
    rev=sub.add_parser("revenue"); rev.add_argument("--event-file",required=True)
    cost=sub.add_parser("cost"); cost.add_argument("--amount",required=True); cost.add_argument("--source",required=True); cost.add_argument("--source-ref",required=True)
    args=parser.parse_args(argv)
    try:
        if args.command=="init": init_db(args.db); result={"initialized":True,"database":args.db}
        elif args.command=="status": result=status(args.db)
        elif args.command=="evaluate": result=evaluate(args.db,args.target,args.max_workers,args.max_generations)
        elif args.command=="revenue":
            event=json.loads(Path(args.event_file).read_text(encoding="utf-8")); record_revenue(event,args.db); result={"accepted":True,"source_ref":event["source_ref"],"verified":True}
        else: record_cost(args.amount,args.source,args.source_ref,args.db); result={"recorded":True,"source_ref":args.source_ref}
        print(json.dumps(result,indent=2,default=str)); return 0
    except (ValueError,sqlite3.Error,OSError,json.JSONDecodeError) as exc:
        print(f"error: {exc}",file=sys.stderr); return 2
if __name__=="__main__": raise SystemExit(main())
