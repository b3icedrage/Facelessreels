const SYMBOLS = ["EURUSD","XAUUSD","GBPJPY","AUDUSD","USDJPY","GBPUSD"];
const DATA_SOURCE = "biquote.io";
const PAYOUT = 0.80;
const MAX_DAILY_LOSS_PCT = 5;

async function send(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: {"content-type":"application/json"},
    body: JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})
  });
}
async function state(env) {
  return await env.DB.prepare("SELECT * FROM bot_state WHERE id=1").first();
}
function ema(values, period) {
  const k = 2/(period+1);
  let v = values[0];
  for (let i=1;i<values.length;i++) v = values[i]*k + v*(1-k);
  return v;
}
function rsi(values, period=14) {
  let gains=0, losses=0;
  for (let i=values.length-period;i<values.length;i++) {
    const d=values[i]-values[i-1];
    if (d>0) gains+=d; else losses-=d;
  }
  const avgGain=gains/period, avgLoss=losses/period;
  if (avgLoss===0) return 100;
  return 100-(100/(1+avgGain/avgLoss));
}
async function getBars(symbol) {
  const url="https://biquote.io/api/"+encodeURIComponent(symbol)+"/ohlc?interval=1m&limit=100";
  const res=await fetch(url,{headers:{"accept":"application/json"}});
  if (!res.ok) throw new Error("market feed HTTP "+res.status);
  const data=await res.json();
  if (!Array.isArray(data.bars)) throw new Error("market feed returned no bars");
  return data.bars.filter(b=>!b.isOpen && Number.isFinite(Number(b.close)) && b.openTime)
    .sort((a,b)=>Date.parse(a.openTime)-Date.parse(b.openTime));
}
async function closeExpired(env, symbol, bars, notifications) {
  const pos=await env.DB.prepare("SELECT * FROM paper_positions WHERE symbol=?").bind(symbol).first();
  if (!pos) return false;
  const later=bars.filter(b=>Date.parse(b.openTime)>Date.parse(pos.entry_bar_time));
  if (!later.length) return false;
  const exit=Number(later[0].close);
  const entry=Number(pos.entry_price);
  if (!Number.isFinite(exit) || !Number.isFinite(entry)) return false;
  const win=pos.direction==="BUY" ? exit>entry : exit<entry;
  const pnl=win ? Number(pos.amount)*PAYOUT : -Number(pos.amount);
  const results=await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO paper_trades (outcome,amount,pnl,symbol,direction,entry_price,exit_price,entry_bar_time) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM paper_positions WHERE symbol=? AND entry_bar_time=?)")
      .bind(win?"win":"loss",pos.amount,pnl,symbol,pos.direction,entry,exit,pos.entry_bar_time,symbol,pos.entry_bar_time),
    env.DB.prepare("UPDATE bot_state SET balance=balance+?,wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND changes()=1")
      .bind(pnl,win?1:0,win?0:1),
    env.DB.prepare("DELETE FROM paper_positions WHERE symbol=? AND entry_bar_time=? AND EXISTS (SELECT 1 FROM paper_trades WHERE symbol=? AND entry_bar_time=?)")
      .bind(symbol,pos.entry_bar_time,symbol,pos.entry_bar_time)
  ]);
  const inserted=Number(results?.[0]?.meta?.changes||0)>0;
  if (!inserted) return false;
  notifications.push(symbol+" "+pos.direction+" closed: "+(win?"WIN":"LOSS")+" | entry "+entry+" | exit "+exit+" | P/L $"+pnl.toFixed(2));
  return true;
}
async function scan(env, chatId=null) {
  const s=await state(env);
  if (!s || s.paused || s.mode!=="demo") {
    if (chatId) await send(env,chatId,"PocketPilot scan skipped: bot is paused or not in demo mode.");
    return {skipped:true};
  }
  const notes=[];
  const closedThisScan=new Set();
  let opened=0, closed=0, errors=0;
  for (const symbol of SYMBOLS) {
    try {
      const bars=await getBars(symbol);
      if (bars.length<40) throw new Error("not enough closed M1 candles");
      const latest=bars[bars.length-1];
      const age=Date.now()-Date.parse(latest.openTime);
      if (!Number.isFinite(age) || age>180000 || age < -60000) {
        notes.push(symbol+": stale/no current M1 data; skipped");
        continue;
      }
      const didClose=await closeExpired(env,symbol,bars,notes);
      if (didClose) { closed++; closedThisScan.add(symbol); }
      if (closedThisScan.has(symbol)) continue;
      const lastSeen=await env.DB.prepare("SELECT last_bar_time FROM signal_state WHERE symbol=?").bind(symbol).first();
      if (lastSeen && lastSeen.last_bar_time===latest.openTime) continue;
      await env.DB.prepare("INSERT INTO signal_state(symbol,last_bar_time,last_signal) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET last_bar_time=excluded.last_bar_time")
        .bind(symbol,latest.openTime,"NONE").run();
      const closes=bars.map(b=>Number(b.close));
      const fast=ema(closes.slice(-60),9);
      const slow=ema(closes.slice(-80),21);
      const current=closes[closes.length-1];
      const momentum=rsi(closes,14);
      let direction="NONE";
      if (fast>slow && current>fast && momentum>=52 && momentum<=70) direction="BUY";
      if (fast<slow && current<fast && momentum>=30 && momentum<=48) direction="SELL";
      if (direction==="NONE") continue;
      const existing=await env.DB.prepare("SELECT symbol FROM paper_positions WHERE symbol=?").bind(symbol).first();
      if (existing) continue;
      const riskState=await state(env);
      const daily=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN pnl<0 THEN -pnl ELSE 0 END),0) AS losses FROM paper_trades WHERE date(created_at)=date('now')").first();
      const dailyLimit=Number(riskState.balance)*MAX_DAILY_LOSS_PCT/100;
      if (Number(daily.losses)>=dailyLimit) {
        notes.push("Daily paper loss limit reached; new positions blocked");
        break;
      }
      const amount=Math.max(0.01,Number(riskState.balance)*Number(riskState.risk_percent)/100);
      const result=await env.DB.prepare("INSERT OR IGNORE INTO paper_positions(symbol,direction,entry_price,amount,entry_bar_time,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)")
        .bind(symbol,direction,current,amount,latest.openTime).run();
      if (result.meta && result.meta.changes>0) {
        opened++;
        await env.DB.prepare("UPDATE signal_state SET last_signal=? WHERE symbol=?").bind(direction,symbol).run();
        notes.push(symbol+" "+direction+" opened @ "+current.toFixed(5)+" | RSI "+momentum.toFixed(1)+" | EMA9/21 trend");
      }
    } catch(e) {
      errors++;
      notes.push(symbol+": feed/analysis error ("+String(e.message||e).slice(0,100)+")");
    }
  }
  if (chatId) {
    const msg=["PocketPilot175Bot M1 scan","Source: "+DATA_SOURCE+" (independent feed, not Pocket Option broker quotes)","Strategy: EMA 9/21 + RSI 14","New paper positions: "+opened,"Closed paper positions: "+closed,"Errors: "+errors].concat(notes.length?notes:["No new signals."]).join("\n");
    await send(env,chatId,msg);
  }
  return {opened,closed,errors,notes};
}

async function phoneEngineCall(env, path, method="GET") {
  if (!env.ENGINE_API_TOKEN) throw new Error("Phone engine token is not configured in this Worker");
  const configuredUrl=env.PHONE_ENGINE_URL;
  if (!configuredUrl) throw new Error("Phone engine URL is not configured as the PHONE_ENGINE_URL Worker variable");
  const base=configuredUrl.replace(/\/+$/, "");
  const response=await fetch(base+path,{
    method,
    headers:{"X-Engine-Token":env.ENGINE_API_TOKEN,"content-type":"application/json"}
  });
  let data={};
  try { data=await response.json(); } catch {}
  if (!response.ok) throw new Error(data.detail || ("Phone engine HTTP "+response.status));
  return data;
}
// PocketPilot phone engine integration

async function handleMessage(env,msg) {
  if (!msg || !msg.chat || !msg.from) return;
  const chatId=msg.chat.id;
  if (!env.OWNER_TELEGRAM_ID || String(msg.from.id)!==String(env.OWNER_TELEGRAM_ID)) {
    await send(env,chatId,"This bot is private. Owner access is not configured."); return;
  }
  const parts=(msg.text||"").trim().split(/\s+/);
  const command=(parts[0]||"").toLowerCase();
  if (command==="/start" || command==="/help") {
    await send(env,chatId,"PocketPilot175Bot is online.\n/status — account status\n/scan — scan six M1 markets now\n/signals — latest paper positions\n/mode demo — paper trading\n/mode real — locked\n/pause — pause automatic scans\n/resume — resume paper scans\n/stats — results\n/history — last 10 closed trades\n/audit — database consistency\n/uid 12345678 — link your Pocket Option UID (format-only)\n/myuid — view linked UID\n/paperwin — manual simulated win\n/paperloss — manual simulated loss\nNo live orders are placed."); return;
  }
  if (command==="/uid" || command==="/myuid") {
    if (command==="/myuid" || !parts[1]) {
      const linked=await env.DB.prepare("SELECT pocket_uid,linked_at FROM owner_profile WHERE telegram_id=?").bind(String(msg.from.id)).first();
      if (command==="/myuid" && !linked) { await send(env,chatId,"No Pocket Option UID is linked yet. Send /uid followed by your 8- or 9-digit UID."); return; }
      if (command==="/myuid") { await send(env,chatId,"Your linked Pocket Option UID: "+linked.pocket_uid+"\nLinked: "+linked.linked_at+"\nCheck: format-only; account ownership is not verified."); return; }
      await send(env,chatId,"Send your Pocket Option UID like this: /uid 12345678\nOnly 8 or 9 digits are accepted. This checks format only; it does not verify account ownership or connect to Pocket Option."); return;
    }
    const uid=String(parts[1]);
    if (!/^\d{8,9}$/.test(uid)) { await send(env,chatId,"Invalid UID format. Enter exactly 8 or 9 digits."); return; }
    if (/^(\d)\1+$/.test(uid)) { await send(env,chatId,"That UID is not accepted. Repeated-digit numbers are rejected."); return; }
    const digits=Array.from(uid).map(Number);
    const ascending=digits.slice(1).every((d,i)=>d-digits[i]===1);
    const descending=digits.slice(1).every((d,i)=>d-digits[i]===-1);
    if (ascending || descending) { await send(env,chatId,"That UID is not accepted. Obvious sequential numbers are rejected."); return; }
    try {
      await env.DB.prepare("INSERT INTO owner_profile (telegram_id,pocket_uid) VALUES (?,?) ON CONFLICT(telegram_id) DO UPDATE SET pocket_uid=excluded.pocket_uid,linked_at=CURRENT_TIMESTAMP").bind(String(msg.from.id),uid).run();
      await send(env,chatId,"UID linked to your owner account.\nPocket Option UID: "+uid+"\nCheck: format-only. This does not prove account ownership, access your broker account, or enable live trading.");
    } catch(e) {
      await send(env,chatId,"That UID could not be linked. It may already be in use or the database rejected it. No other account was changed.");
    }
    return;
  }

  if (command==="/engine") {
    const action=(parts[1]||"status").toLowerCase();
    if (!["connect","status","disconnect"].includes(action)) {
      await send(env,chatId,"Use /engine connect, /engine status, or /engine disconnect. This connection is demo-only."); return;
    }
    try {
      const result=await phoneEngineCall(env,action==="connect"?"/connect":action==="disconnect"?"/disconnect":"/status",action==="status"?"GET":"POST");
      if (action==="connect") {
        await send(env,chatId,"Pocket Option engine connection: "+(result.connected?"CONNECTED":"NOT CONNECTED")+"\nAccount mode: "+(result.account_mode||"unknown")+"\nBalance: "+(result.balance===undefined?"unavailable":"$"+Number(result.balance).toFixed(2))+"\nDemo-only guard: active. No order was placed.");
      } else if (action==="status") {
        await send(env,chatId,"Phone engine: "+(result.connected?"CONNECTED":"DISCONNECTED")+"\nAccount mode: "+(result.account_mode||"unknown")+"\nBalance: "+(result.balance===undefined?"unavailable":"$"+Number(result.balance).toFixed(2)));
      } else {
        await send(env,chatId,"Phone engine disconnected. No order was placed.");
      }
    } catch(e) {
      await send(env,chatId,"Phone engine error: "+String(e.message||e).slice(0,180)+"\nCheck that ENGINE_API_TOKEN is set as a Worker secret and your phone engine is running.");
    }
    return;
  }
  if (command==="/status") {
    const s=await state(env);
    await send(env,chatId,"PocketPilot175Bot\nMode: "+s.mode+"\nStatus: "+(s.paused?"PAUSED":"RUNNING")+"\nPaper balance: $"+Number(s.balance).toFixed(2)+"\nRisk: "+s.risk_percent+"%\nMarkets: "+SYMBOLS.join(", ")+"\nTimeframe: M1\nStrategy: EMA9/EMA21 + RSI14\nFeed: "+DATA_SOURCE+"\nExecution: SIMULATED ONLY"); return;
  }
  if (command==="/mode") {
    if (parts[1]==="real") { await send(env,chatId,"Real-money mode is locked. No live orders or unofficial broker execution are supported."); return; }
    if (parts[1]!=="demo") { await send(env,chatId,"Use /mode demo. Real mode is locked."); return; }
    await env.DB.prepare("UPDATE bot_state SET mode='demo' WHERE id=1").run();
    await send(env,chatId,"Paper mode selected. No broker orders can be placed."); return;
  }
  if (command==="/pause") {
    await env.DB.prepare("UPDATE bot_state SET paused=1 WHERE id=1").run();
    await send(env,chatId,"Automatic paper scans paused."); return;
  }
  if (command==="/resume") {
    await env.DB.prepare("UPDATE bot_state SET mode='demo',paused=0 WHERE id=1").run();
    await send(env,chatId,"Paper mode resumed. Scheduled paper scans will run on the configured schedule. No broker orders are placed."); return;
  }
  if (command==="/scan") { await scan(env,chatId); return; }
  if (command==="/signals") {
    const rows=await env.DB.prepare("SELECT symbol,direction,entry_price,amount,entry_bar_time FROM paper_positions ORDER BY created_at DESC LIMIT 10").all();
    if (!rows.results.length) { await send(env,chatId,"No open paper positions."); return; }
    await send(env,chatId,"Open paper positions:\n"+rows.results.map(x=>x.symbol+" "+x.direction+" @ "+x.entry_price+" | stake $"+Number(x.amount).toFixed(2)+" | "+x.entry_bar_time).join("\n")); return;
  }
  if (command==="/history") {
    const rows=await env.DB.prepare("SELECT symbol,direction,entry_price,exit_price,amount,pnl,outcome,entry_bar_time,created_at FROM paper_trades ORDER BY id DESC LIMIT 10").all();
    if (!rows.results.length) { await send(env,chatId,"No closed paper trades recorded."); return; }
    await send(env,chatId,"Last closed paper trades:\n"+rows.results.map(x=>(x.symbol||"Manual")+" "+(x.direction||"—")+" "+String(x.outcome).toUpperCase()+" | entry "+(x.entry_price??"—")+" | exit "+(x.exit_price??"—")+" | P/L $"+Number(x.pnl).toFixed(2)+" | "+(x.entry_bar_time||x.created_at)).join("\n")); return;
  }
  if (command==="/audit") {
    const s=await state(env);
    const counts=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM paper_trades) AS closed_trades,(SELECT COUNT(*) FROM paper_positions) AS open_positions,(SELECT COUNT(*) FROM paper_trades WHERE symbol IS NOT NULL AND entry_bar_time IS NOT NULL) AS keyed_trades,COALESCE((SELECT SUM(pnl) FROM paper_trades),0) AS recorded_pnl FROM bot_state WHERE id=1").first();
    await send(env,chatId,"PocketPilot audit\nMode: "+s.mode+" | "+(s.paused?"PAUSED":"RUNNING")+"\nBalance: $"+Number(s.balance).toFixed(2)+"\nWins/losses: "+s.wins+"/"+s.losses+"\nClosed trades: "+counts.closed_trades+"\nOpen positions: "+counts.open_positions+"\nIdempotency-keyed trades: "+counts.keyed_trades+"\nRecorded P/L: $"+Number(counts.recorded_pnl).toFixed(2)+"\nHistorical records preserved; no reconciliation applied."); return;
  }
  if (command==="/stats") {
    const s=await state(env);
    const row=await env.DB.prepare("SELECT COUNT(*) AS total FROM paper_trades").first();
    const pos=await env.DB.prepare("SELECT COUNT(*) AS n FROM paper_positions").first();
    await send(env,chatId,"Paper stats\nBalance: $"+Number(s.balance).toFixed(2)+"\nWins: "+s.wins+"\nLosses: "+s.losses+"\nClosed trades: "+row.total+"\nOpen simulated positions: "+pos.n); return;
  }
  if (command==="/paperwin" || command==="/paperloss") {
    const s=await state(env);
    if (s.paused) { await send(env,chatId,"Bot is paused. Use /resume first."); return; }
    const amount=Math.max(0.01,Number(s.balance)*Number(s.risk_percent)/100);
    const win=command==="/paperwin";
    const pnl=win?amount*PAYOUT:-amount;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO paper_trades (outcome,amount,pnl) VALUES (?,?,?)").bind(win?"win":"loss",amount,pnl),
      env.DB.prepare("UPDATE bot_state SET balance=balance+?,wins=wins+?,losses=losses+? WHERE id=1").bind(pnl,win?1:0,win?0:1)
    ]);
    const n=await state(env);
    await send(env,chatId,(win?"Simulated win":"Simulated loss")+"\nP/L: $"+pnl.toFixed(2)+"\nBalance: $"+Number(n.balance).toFixed(2)); return;
  }
  await send(env,chatId,"Unknown command. Send /help.");
}
export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if (request.method==="GET" && url.pathname==="/health") return Response.json({ok:true,service:"PocketPilot175Bot",mode:"paper-only",symbols:SYMBOLS,timeframe:"M1",strategy:"EMA9/EMA21+RSI14",data_source:DATA_SOURCE});
  if (request.method!=="POST" || url.pathname!=="/telegram-webhook") return new Response("Not found",{status:404});
  if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});
  let update; try { update=await request.json(); } catch { return new Response("Bad request",{status:400}); }
  try { if (update.message) await handleMessage(env,update.message); } catch(e) { console.error(e); }
  return new Response("OK");
 },
 async scheduled(controller,env,ctx) {
  ctx.waitUntil(scan(env));
 }
};