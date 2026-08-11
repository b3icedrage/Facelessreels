import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  DerivClient,
  type AccountInfo,
  type ConnectionStatus,
  type OpenContractInfo,
  type ProposalInfo,
  type SymbolInfo,
  type TickPoint,
  type TxEvent,
} from "@/lib/deriv";
import { createEngine, type SignalEvent, type StrategyName } from "@/lib/signals";

export interface TicketParams {
  symbol: string;
  contractType: "CALL" | "PUT";
  duration: number;
  durationUnit: "s" | "m" | "h";
  stake: number;
}

export interface AutoTradeResult {
  at: number;
  ok: boolean;
  message: string;
}

interface OpenTradeMeta {
  symbol: string;
  contractType: "CALL" | "PUT";
  duration: number;
  durationUnit: string;
  stake: number;
  payout: number;
  currency: string;
  buyTime: number;
  source: "manual" | "auto";
  longcode?: string;
}

const TICKS_WINDOW = 240;
const AUTO_COOLDOWN_MS = 30_000;

export function useDeriv(options: {
  token: string | null;
  strategy?: StrategyName | null;
  autoTrade?: boolean;
}) {
  const { token, strategy, autoTrade } = options;

  const recordTrade = useMutation(api.trades.recordTrade);
  const updateAccountInfo = useMutation(api.deriv.saveAccount);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("R_100");
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const [lastTick, setLastTick] = useState<TickPoint | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceFlash, setBalanceFlash] = useState<"up" | "down" | null>(null);
  const [proposal, setProposal] = useState<ProposalInfo | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [openContracts, setOpenContracts] = useState<OpenContractInfo[]>([]);
  const [txFeed, setTxFeed] = useState<TxEvent[]>([]);
  const [signal, setSignal] = useState<SignalEvent | null>(null);
  const [indicator, setIndicator] = useState<any>(null);
  const [lastAutoTrade, setLastAutoTrade] = useState<AutoTradeResult | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- refs (avoid stale closures inside event handlers) ----
  const clientRef = useRef<DerivClient | null>(null);
  if (!clientRef.current) clientRef.current = new DerivClient();

  const statusRef = useRef<ConnectionStatus>("idle");
  statusRef.current = status;
  const accountRef = useRef<AccountInfo | null>(null);
  accountRef.current = account;
  const autoTradeRef = useRef(false);
  autoTradeRef.current = !!autoTrade;
  const strategyRef = useRef<StrategyName>("ema_cross");
  strategyRef.current = strategy ?? "ema_cross";
  const lastAutoTradeAtRef = useRef(0);
  const openAutoContractRef = useRef(false);
  const openTradeMetaRef = useRef(new Map<number, OpenTradeMeta>());
  const prevBalanceRef = useRef<number | null>(null);

  // ---- ticket state ----
  const [ticket, setTicketState] = useState<TicketParams>({
    symbol: "R_100",
    contractType: "CALL",
    duration: 1,
    durationUnit: "m",
    stake: 10,
  });
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;

  const setTicket = useCallback((patch: Partial<TicketParams>) => {
    setTicketState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ---- connection lifecycle ----
  useEffect(() => {
    const c = clientRef.current!;
    if (!token) {
      c.disconnect();
      setAccount(null);
      setSymbols([]);
      setTicks([]);
      setLastTick(null);
      setBalance(null);
      setOpenContracts([]);
      setError(null);
      setStatus(c.getStatus());
      return;
    }

    setStatus("connecting");
    setError(null);
    const offStatus = c.on("status", (s: ConnectionStatus) => setStatus(s));
    const offError = c.on("error", (err: any) =>
      setError(err?.message ?? "Deriv connection error"),
    );
    c.connect(token);
    return () => {
      offStatus();
      offError();
      c.disconnect();
    };
  }, [token]);

  const reconnect = useCallback(() => {
    const c = clientRef.current!;
    c.disconnect();
    if (token) c.connect(token);
  }, [token]);

  // ---- post-authorize setup ----
  useEffect(() => {
    const c = clientRef.current!;
    const off = c.on("authorize", async (auth: any) => {
      const info: AccountInfo = {
        loginid: auth.loginid,
        currency: auth.currency,
        balance: auth.balance,
        email: auth.email,
      };
      setAccount(info);
      setBalance(info.balance);
      prevBalanceRef.current = info.balance;
      if (auth.loginid) {
        updateAccountInfo({ loginId: auth.loginid, currency: auth.currency }).catch(() => {});
      }
      try {
        const all = await c.fetchSymbols();
        const filtered = all.filter(
          (s) =>
            s.market === "synthetic_index" ||
            (s.market === "forex" && s.symbol.startsWith("frx")) ||
            s.market === "crypto",
        );
        if (filtered.length) setSymbols(filtered);
      } catch {
        /* non-fatal */
      }
      try {
        const port = await c.fetchPortfolio();
        applyPortfolio(port);
      } catch {
        /* non-fatal */
      }
      c.subscribeBalance((m: any) => {
        if (m.balance?.balance != null) {
          const b = m.balance.balance;
          const prev = prevBalanceRef.current;
          if (prev != null && b !== prev) {
            setBalanceFlash(b > prev ? "up" : "down");
          }
          prevBalanceRef.current = b;
          setBalance(b);
        }
      });
      c.subscribeTransaction((m: any) => {
        const tx = m.transaction;
        if (!tx) return;
        const ev: TxEvent = {
          action: tx.action,
          amount: tx.amount,
          balance: tx.balance,
          contractId: tx.contract_id,
          longcode: tx.longcode,
          transactionId: tx.transaction_id,
          purchaseTime: tx.purchase_time,
        };
        setTxFeed((prev) => [ev, ...prev].slice(0, 30));
        if (tx.balance != null) setBalance(tx.balance);
        if (tx.action === "SELL" || tx.action === "EXIT") {
          if (tx.contract_id != null) {
            setOpenContracts((prev) => prev.filter((x) => x.contractId !== tx.contract_id));
            openTradeMetaRef.current.delete(tx.contract_id);
            openAutoContractRef.current = false;
          }
        } else if (tx.action === "BUY") {
          c.fetchPortfolio()
            .then((port) => applyPortfolio(port))
            .catch(() => {});
        }
      });
    });
    return off;
  }, [updateAccountInfo]);

  function applyPortfolio(port: OpenContractInfo[]) {
    const meta = openTradeMetaRef.current;
    const next = port.map((c) => {
      if (!meta.has(c.contractId)) {
        meta.set(c.contractId, {
          symbol: c.symbol,
          contractType: c.contractType === "PUT" ? "PUT" : "CALL",
          duration: 0,
          durationUnit: "m",
          stake: c.buyPrice,
          payout: c.payout ?? 0,
          currency: accountRef.current?.currency ?? "USD",
          buyTime: c.purchaseTime * 1000,
          source: "manual",
          longcode: c.longcode,
        });
      }
      return c;
    });
    setOpenContracts(next);
  }

  // ---- tick subscription + signal engine ----
  useEffect(() => {
    const c = clientRef.current!;
    if (status !== "connected" || !account) return;

    const engine = createEngine(strategyRef.current);
    setSignal(null);
    setIndicator(null);
    setTicks([]);
    setLastTick(null);

    const off = c.subscribeTicks(selectedSymbol, (m: any) => {
      if (!m.tick || m.tick.quote == null) return;
      const t: TickPoint = { epoch: m.tick.epoch, quote: m.tick.quote };
      setLastTick(t);
      setTicks((prev) => {
        const next = [...prev, t];
        return next.length > TICKS_WINDOW ? next.slice(next.length - TICKS_WINDOW) : next;
      });
      setIndicator(engine.snapshot());
      const sig = engine.onTick(t.quote, t.epoch);
      if (sig) {
        setSignal(sig);
        maybeAutoTrade(sig);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, status, account]);

  // ---- live proposal for the ticket ----
  useEffect(() => {
    const c = clientRef.current!;
    if (status !== "connected" || !account || !ticket.symbol) {
      setProposal(null);
      setProposalError(null);
      return;
    }
    setProposal(null);
    setProposalError(null);
    const off = c.subscribeProposal(
      {
        amount: ticket.stake,
        basis: "stake",
        contract_type: ticket.contractType,
        currency: account.currency,
        duration: ticket.duration,
        duration_unit: ticket.durationUnit,
        symbol: ticket.symbol,
      },
      (m: any) => {
        if (m.error) {
          setProposalError(m.error.message);
          setProposal(null);
        } else if (m.proposal) {
          setProposal({
            id: m.proposal.id,
            askPrice: m.proposal.ask_price,
            payout: m.proposal.payout,
            longcode: m.proposal.longcode,
            spot: m.proposal.spot,
          });
          setProposalError(null);
        }
      },
    );
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, account, ticket.symbol, ticket.contractType, ticket.duration, ticket.durationUnit, ticket.stake]);

  // ---- trade placement ----
  const placeTrade = useCallback(
    async (
      direction?: "CALL" | "PUT",
      source: "manual" | "auto" = "manual",
    ): Promise<{ ok: boolean; message: string }> => {
      const c = clientRef.current!;
      const acct = accountRef.current;
      if (!c || !acct || statusRef.current !== "connected") {
        return { ok: false, message: "Not connected to Deriv yet." };
      }
      setBusy(true);
      try {
        const dir = direction ?? ticketRef.current.contractType;
        const t = ticketRef.current;
        const quote = await c.request({
          proposal: 1,
          amount: t.stake,
          basis: "stake",
          contract_type: dir,
          currency: acct.currency,
          duration: t.duration,
          duration_unit: t.durationUnit,
          symbol: t.symbol,
        });
        const p = quote.proposal;
        if (!p) return { ok: false, message: "No quote available right now — try again." };

        const buyResp = await c.request({ buy: p.id, price: t.stake });
        const b = buyResp.buy;
        if (!b) return { ok: false, message: buyResp.error?.message ?? "Trade was not executed." };

        const buyTimeMs = (b.start_time ?? Math.floor(Date.now() / 1000)) * 1000;
        const meta: OpenTradeMeta = {
          symbol: t.symbol,
          contractType: dir,
          duration: t.duration,
          durationUnit: t.durationUnit,
          stake: t.stake,
          payout: b.payout ?? p.payout,
          currency: acct.currency,
          buyTime: buyTimeMs,
          source,
          longcode: b.longcode ?? p.longcode,
        };
        openTradeMetaRef.current.set(b.contract_id, meta);
        if (source === "auto") openAutoContractRef.current = true;

        await recordTrade({
          contractId: String(b.contract_id),
          symbol: meta.symbol,
          contractType: meta.contractType,
          duration: meta.duration,
          durationUnit: meta.durationUnit,
          stake: meta.stake,
          payout: meta.payout,
          currency: meta.currency,
          status: "open",
          entrySpot: p.spot,
          longcode: meta.longcode,
          buyTime: meta.buyTime,
          source: meta.source,
        });

        c.subscribeContract(b.contract_id, (m: any) => settleContract(m));

        return { ok: true, message: `Contract #${b.contract_id} opened` };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      } finally {
        setBusy(false);
      }
    },
    [recordTrade],
  );

  const settleContract = useCallback(
    (m: any) => {
      const poc = m.proposal_open_contract;
      if (!poc || !poc.is_sold) return;
      const c = clientRef.current!;
      const meta = openTradeMetaRef.current.get(poc.contract_id);
      const profit = poc.profit ?? (poc.sell_price ?? 0) - (poc.buy_price ?? 0);
      const status: "won" | "lost" | "sold" = profit > 0 ? "won" : profit < 0 ? "lost" : "sold";

      recordTrade({
        contractId: String(poc.contract_id),
        symbol: meta?.symbol ?? poc.symbol ?? "—",
        contractType: meta?.contractType ?? (poc.contract_type === "PUT" ? "PUT" : "CALL"),
        duration: meta?.duration ?? 0,
        durationUnit: meta?.durationUnit ?? "m",
        stake: meta?.stake ?? poc.buy_price ?? 0,
        payout: meta?.payout ?? poc.payout ?? 0,
        currency: meta?.currency ?? accountRef.current?.currency ?? "USD",
        status,
        profit: Math.round(profit * 100) / 100,
        exitSpot: poc.exit_tick?.quote ?? poc.exit_spot,
        longcode: meta?.longcode ?? poc.longcode,
        buyTime: meta?.buyTime ?? (poc.date_start ?? Math.floor(Date.now() / 1000)) * 1000,
        sellTime: (poc.date_expiry ?? Math.floor(Date.now() / 1000)) * 1000,
        source: meta?.source ?? "manual",
      }).catch(() => {});

      openTradeMetaRef.current.delete(poc.contract_id);
      openAutoContractRef.current = false;
      setOpenContracts((prev) => prev.filter((x) => x.contractId !== poc.contract_id));
      if (c.getStatus() === "connected") {
        c.fetchPortfolio()
          .then((port) => applyPortfolio(port))
          .catch(() => {});
      }
    },
    [recordTrade],
  );

  const sellContract = useCallback(async (contractId: number) => {
    const c = clientRef.current!;
    try {
      const res = await c.request({ sell: contractId, price: 0 });
      if (res.error) return { ok: false, message: res.error.message };
      return { ok: true, message: "Sell order sent" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }, []);

  // ---- auto trading ----
  const maybeAutoTrade = useCallback(
    (sig: SignalEvent) => {
      if (!autoTradeRef.current) return;
      const now = Date.now();
      if (now - lastAutoTradeAtRef.current < AUTO_COOLDOWN_MS) return;
      if (openAutoContractRef.current) return;
      lastAutoTradeAtRef.current = now;
      setLastAutoTrade({ at: now, ok: false, message: `Signal ${sig.direction} — placing trade…` });
      placeTrade(sig.direction, "auto").then((res) => {
        setLastAutoTrade({ at: now, ok: res.ok, message: res.message });
      });
    },
    [placeTrade],
  );

  return {
    status,
    error,
    reconnect,
    account,
    symbols,
    selectedSymbol,
    setSelectedSymbol,
    ticks,
    lastTick,
    balance,
    balanceFlash,
    clearBalanceFlash: () => setBalanceFlash(null),
    proposal,
    proposalError,
    openContracts,
    txFeed,
    signal,
    indicator,
    strategy: strategyRef.current,
    lastAutoTrade,
    busy,
    ticket,
    setTicket,
    placeTrade,
    sellContract,
  };
}
