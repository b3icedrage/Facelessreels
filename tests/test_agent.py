import hashlib, hmac, tempfile, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from facelessreels.agent import canonical_event, connect, evaluate, init_db, record_cost, record_revenue

class ProfitGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / "test.sqlite3")
        self.secret = "test-secret-long-enough-for-hmac-123456"
        self.now = datetime.now(timezone.utc) + timedelta(minutes=5)
        init_db(self.db)
    def tearDown(self): self.temp.cleanup()
    def signed_event(self, ref="pay-1", amount="8.00"):
        event = {"kind":"income","source":"test-provider","source_ref":ref,"amount":amount,"currency":"USD","timestamp":self.now.isoformat()}
        event["signature"] = hmac.new(self.secret.encode(), canonical_event(event), hashlib.sha256).hexdigest()
        return event
    def test_verified_profit_creates_one_bounded_clone(self):
        record_revenue(self.signed_event(), self.db, self.secret)
        record_cost("2.00","hosting","cost-1",self.db)
        result = evaluate(self.db,"5.00",3,2,self.now)
        self.assertEqual(result["net_profit_usd"],"6.00")
        self.assertEqual(result["outcome"],"target_met_clone_created")
        with connect(self.db) as db: self.assertEqual(db.execute("SELECT COUNT(*) FROM workers").fetchone()[0],2)
    def test_invalid_signature_is_rejected(self):
        event = self.signed_event(); event["amount"]="900.00"
        with self.assertRaisesRegex(ValueError,"signature is invalid"): record_revenue(event,self.db,self.secret)
    def test_replayed_revenue_id_is_rejected(self):
        record_revenue(self.signed_event(),self.db,self.secret)
        with self.assertRaises(Exception): record_revenue(self.signed_event(),self.db,self.secret)
    def test_below_target_stops_active_workers(self):
        result = evaluate(self.db,"5.00",3,2,self.now)
        self.assertEqual(result["outcome"],"target_missed_workers_stopped")
        with connect(self.db) as db: self.assertEqual(db.execute("SELECT COUNT(*) FROM workers WHERE status='active'").fetchone()[0],0)
    def test_worker_and_generation_limits_are_enforced(self):
        record_revenue(self.signed_event(),self.db,self.secret)
        first = evaluate(self.db,"5.00",2,1,self.now)
        self.assertEqual(first["outcome"],"target_met_clone_created")
        second = evaluate(self.db,"5.00",2,1,self.now)
        self.assertEqual(second["outcome"],"target_met_limits_reached")
        with connect(self.db) as db: self.assertEqual(db.execute("SELECT COUNT(*) FROM workers").fetchone()[0],2)
    def test_costs_reduce_profit(self):
        record_revenue(self.signed_event(amount="5.00"),self.db,self.secret)
        record_cost("1.00","render","render-1",self.db)
        result = evaluate(self.db,"5.00",3,2,self.now)
        self.assertEqual(result["net_profit_usd"],"4.00")
        self.assertEqual(result["outcome"],"target_missed_workers_stopped")

if __name__ == "__main__": unittest.main()
