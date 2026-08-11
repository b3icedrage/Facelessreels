import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Clock,
  Loader2,
  LogOut,
  PlugZap,
  RefreshCw,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { LiveChart } from "@/components/trading/LiveChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDeriv, type TicketParams } from "@/hooks/useDeriv";

const DURATION_PRESETS: Record<
  string,
  { label: string; duration: number; unit: "s" | "m" | "h" }[]
> = {
  synthetic_index: [
    { label: "15s", duration: 15, unit: "s" },
    { label: "30s", duration: 30, unit: "s" },
    { label: "1m", duration: 1, unit: "m" },
    { label: "5m", duration: 5, unit: "m" },
    { label: "15m", duration: 15, unit: "m" },
    { label: "1h", duration: 1, unit: "h" },
  ],
  forex: [
    { label: "1m", duration: 1, unit: "m" },
    { label: "5m", duration: 5, unit: "m" },
    { label: "15m", duration: 15, unit: "m" },
    { label: "1h", duration: 1, unit: "h" },
    { label: "4h", duration: 4, unit: "h" },
  ],
  crypto: [
    { label: "1m", duration: 1, unit: "m" },
    { label: "5m", duration: 5, unit: "m" },
    { label: "15m", duration: 15, unit: "m" },
    { label: "1h", duration: 1, unit: "h" },
  ],
};

const STAKE_PRESETS = [1, 5, 10, 25, 50, 100];

const MARKET_LABEL: Record<string, string> = {
  synthetic_index: "Synthetic indices",
  forex: "Forex (OTC)",
  crypto: "Crypto (OTC)",
};

function fmt(n: number | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Countdown({ toSeconds }: { toSeconds?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!toSeconds) return <span className="font-mono text-xs text-muted-foreground">—</span>;
  const remain = Math.max(0, toSeconds * 1000 - now);
  const total = Math.floor(remain / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return <span className="font-mono text-xs tabular-nums">{m}:{s}</span>;
}

export function TradingPage() {
  const { signOut } = useAuthActions();
  const accountRow = useQuery(api.deriv.getMyAccount);
  const settingsRow = useQuery(api.settings.getMySettings);
  const trades = useQuery(api.trades.getMyTrades, { limit: 20 });
  const stats = useQuery(api.trades.getMyStats);
  const saveAccount = useMutation(api.deriv.saveAccount);
  const removeAccount = useMutation(api.deriv.removeAccount);
  const updateSettings = useMutation(api.settings.updateSettings);

  const token = accountRow?.apiToken ?? null;
  const deriv = useDeriv({
    token,
    strategy: settingsRow?.strategy ?? null,
    autoTrade: settingsRow?.autoTrade ?? false,
  });

  const [tokenInput, setTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [lastTrade, setLastTrade] = useState<{ ok: boolean; message: string } | null>(null);

  // Hydrate the ticket from saved settings once, after they load.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (settingsRow && !hydratedRef.current) {
      hydratedRef.current = true;
      deriv.setSelectedSymbol(settingsRow.symbol);
      deriv.setTicket({
        symbol: settingsRow.symbol,
        duration: settingsRow.duration,
        durationUnit: settingsRow.durationUnit as TicketParams["durationUnit"],
        stake: settingsRow.stake,
      });
    }
  }, [settingsRow, deriv.setTicket, deriv.setSelectedSymbol]);

  const marketOf = (sym: string) =>
    deriv.symbols.find((s) => s.symbol === sym)?.market ?? "synthetic_index";
  const presets = DURATION_PRESETS[marketOf(deriv.ticket.symbol)] ?? DURATION_PRESETS.synthetic_index;

  const selectedInfo = deriv.symbols.find((s) => s.symbol === deriv.ticket.symbol);

  async function handleSaveToken() {
    const t = tokenInput.trim();
    if (t.length < 10) {
      setTokenError("Paste the full Deriv API token (it's long — copy it all).");
      return;
    }
    setSavingToken(true);
    setTokenError(null);
    try {
      await saveAccount({ apiToken: t });
      setTokenInput("");
    } catch (e: any) {
      setTokenError(e?.message ?? "Could not save the token.");
    } finally {
      setSavingToken(false);
    }
  }

  async function handleRemoveToken() {
    await removeAccount().catch(() => {});
    hydratedRef.current = false;
  }

  function onSelectSymbol(sym: string) {
    deriv.setSelectedSymbol(sym);
    const p = (DURATION_PRESETS[marketOf(sym)] ?? DURATION_PRESETS.synthetic_index)[0];
    deriv.setTicket({ symbol: sym, duration: p.duration, durationUnit: p.unit });
    updateSettings({ symbol: sym, duration: p.duration, durationUnit: p.unit }).catch(() => {});
  }

  function onSelectDuration(d: number, u: "s" | "m" | "h") {
    deriv.setTicket({ duration: d, durationUnit: u });
    updateSettings({ duration: d, durationUnit: u }).catch(() => {});
  }

  function onStake(v: number) {
    const clamped = Math.max(1, Math.min(10000, Math.round(v * 100) / 100));
    deriv.setTicket({ stake: clamped });
    updateSettings({ stake: clamped }).catch(() => {});
  }

  async function onPlaceTrade() {
    setLastTrade(null);
    const res = await deriv.placeTrade();
    setLastTrade(res);
  }

  async function onSell(contractId: number) {
    const res = await deriv.sellContract(contractId);
    setLastTrade(res);
  }

  if (accountRow === undefined || settingsRow === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading terminal…</span>
      </div>
    );
  }

  // ---- Onboarding: no Deriv token yet ----
  if (!accountRow) {
    return (
      <div className="flex min-h-screen flex-col">
        <HeaderBar
          connected={false}
          statusLabel="Offline"
          onSignOut={signOut}
        />
        <div className="terminal-grid flex flex-1 items-center justify-center px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-xl"
          >
            <Card className="glass shadow-2xl">
              <CardHeader className="space-y-3 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <PlugZap className="h-7 w-7" />
                </div>
                <CardTitle className="text-2xl">Connect your Deriv demo account</CardTitle>
                <CardDescription className="mx-auto max-w-md">
                  Voltix trades on Deriv's API with <span className="text-emerald-400">virtual funds</span> from
                  your demo account — real market prices, live order execution, zero real money.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ol className="space-y-3">
                  {[
                    "Create a free Deriv account at deriv.com (takes ~2 minutes).",
                    "In Deriv: Settings → API token → create a token for your demo account.",
                    "Paste that token below — the terminal connects and loads live markets.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-mono text-xs font-semibold text-foreground">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="space-y-2">
                  <Label htmlFor="deriv-token">Deriv demo API token</Label>
                  <Input
                    id="deriv-token"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                      setTokenError(null);
                    }}
                    placeholder="Paste your API token"
                    className="font-mono"
                  />
                  {tokenError && <p className="text-sm text-rose-400">{tokenError}</p>}
                  <Button className="w-full" size="lg" onClick={handleSaveToken} disabled={savingToken}>
                    {savingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                    Connect demo account
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  The token is stored on your account and only ever sent to Deriv's servers from your browser.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---- Main terminal ----
  const connected = deriv.status === "connected";
  const showBalance = deriv.balance ?? (deriv.account?.balance ?? null);
  const priceUp = deriv.ticks.length > 1 && deriv.lastTick!.quote >= deriv.ticks[0].quote;

  return (
    <div className="min-h-screen pb-16">
      <HeaderBar
        connected={deriv.status === "connected"}
        connecting={deriv.status === "connecting"}
        statusLabel={
          deriv.status === "connected"
            ? `Live · ${deriv.account?.loginid ?? accountRow.loginId ?? ""}`
            : deriv.status === "connecting"
              ? "Connecting…"
              : deriv.status === "error"
                ? "Connection error"
                : "Offline"
        }
        onSignOut={signOut}
        onToggleSettings={() => setShowSettings((v) => !v)}
        rightSlot={
          showBalance != null ? (
            <div
              key={String(showBalance)}
              className={`rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-right ${
                deriv.balanceFlash === "up"
                  ? "tick-flash-up"
                  : deriv.balanceFlash === "down"
                    ? "tick-flash-down"
                    : ""
              }`}
            >
              <div className="font-mono text-base font-semibold tabular-nums">
                {fmt(showBalance)} <span className="text-xs font-normal text-muted-foreground">{deriv.account?.currency ?? "USD"}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Demo balance</div>
            </div>
          ) : null
        }
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 pt-4">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Demo mode.</strong> All trades use the virtual balance of your Deriv demo account — no real money is
            ever involved. Not financial advice.
          </span>
        </div>

        {deriv.status === "error" && (
          <div className="flex items-center gap-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="flex-1">{deriv.error ?? "Could not connect to Deriv. Check your token."}</span>
            <Button variant="outline" size="sm" onClick={deriv.reconnect}>
              <RefreshCw className="h-3.5 w-3.5" /> Reconnect
            </Button>
            <Button variant="destructive" size="sm" onClick={handleRemoveToken}>
              <Trash2 className="h-3.5 w-3.5" /> Remove token
            </Button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ---- Chart panel ---- */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="glass">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={deriv.ticket.symbol} onValueChange={onSelectSymbol} disabled={!deriv.symbols.length}>
                    <SelectTrigger className="w-64 font-mono">
                      <SelectValue placeholder="Select market" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(MARKET_LABEL).map((market) => {
                        const items = deriv.symbols.filter((s) => s.market === market);
                        if (!items.length) return null;
                        return (
                          <SelectGroup key={market}>
                            <SelectLabel>{MARKET_LABEL[market]}</SelectLabel>
                            {items.map((s) => (
                              <SelectItem key={s.symbol} value={s.symbol} className="font-mono">
                                {s.symbol} <span className="text-muted-foreground">· {s.display}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <div className="text-left">
                    <div className={`font-mono text-2xl font-semibold tabular-nums ${deriv.lastTick ? (priceUp ? "text-emerald-400" : "text-rose-400") : "text-muted-foreground"}`}>
                      {deriv.lastTick ? fmt(deriv.lastTick.quote, 4) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{selectedInfo?.display ?? deriv.ticket.symbol}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {deriv.signal && (
                    <Badge
                      className={
                        deriv.signal.direction === "CALL"
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/15 text-rose-400"
                      }
                    >
                      {deriv.signal.direction === "CALL" ? "▲ RISE" : "▼ FALL"} signal
                    </Badge>
                  )}
                  {!connected && (
                    <Badge variant="outline" className="text-muted-foreground">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> connecting
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <LiveChart ticks={deriv.ticks} />
              </CardContent>
            </Card>

            {/* ---- Open positions ---- */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" /> Open positions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deriv.openContracts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No open contracts. Place your first rise/fall trade →
                  </p>
                ) : (
                  <div className="space-y-2">
                    {deriv.openContracts.map((c) => (
                      <div
                        key={c.contractId}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5"
                      >
                        <span className="font-mono text-sm">#{c.contractId}</span>
                        <span className="font-mono text-xs text-muted-foreground">{c.symbol}</span>
                        <Badge
                          className={
                            c.contractType === "CALL"
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                              : "border-rose-500/30 bg-rose-500/15 text-rose-400"
                          }
                        >
                          {c.contractType === "CALL" ? "Rise" : "Fall"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Stake <span className="font-mono text-foreground">{fmt(c.buyPrice)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Payout <span className="font-mono text-foreground">{fmt(c.payout)}</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> <Countdown toSeconds={c.dateExpiry} />
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => onSell(c.contractId)}
                          disabled={!connected}
                        >
                          Sell now
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ---- History ---- */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Trade history</CardTitle>
              </CardHeader>
              <CardContent>
                {trades === undefined ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-10 rounded-lg shimmer-bar" />
                    ))}
                  </div>
                ) : trades.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No trades yet — history appears here as contracts settle.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">Time</th>
                          <th className="pb-2 pr-3 font-medium">Market</th>
                          <th className="pb-2 pr-3 font-medium">Dir</th>
                          <th className="pb-2 pr-3 font-medium">Duration</th>
                          <th className="pb-2 pr-3 font-medium">Stake</th>
                          <th className="pb-2 pr-3 font-medium">Result</th>
                          <th className="pb-2 text-right font-medium">P/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t) => (
                          <tr key={t._id} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                              {new Date(t.buyTime).toLocaleTimeString()}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs">{t.symbol}</td>
                            <td className="py-2 pr-3">
                              <span className={t.contractType === "CALL" ? "text-emerald-400" : "text-rose-400"}>
                                {t.contractType === "CALL" ? "Rise" : "Fall"}
                              </span>
                              {t.source === "auto" && (
                                <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px] text-primary">
                                  auto
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs">
                              {t.duration === 0 ? "—" : `${t.duration}${t.durationUnit}`}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs">{fmt(t.stake)}</td>
                            <td className="py-2 pr-3">
                              {t.status === "won" ? (
                                <span className="text-emerald-400">Won</span>
                              ) : t.status === "lost" ? (
                                <span className="text-rose-400">Lost</span>
                              ) : t.status === "sold" ? (
                                <span className="text-amber-400">Sold</span>
                              ) : (
                                <span className="text-muted-foreground">Open</span>
                              )}
                            </td>
                            <td
                              className={`py-2 text-right font-mono text-xs tabular-nums ${
                                (t.profit ?? 0) > 0
                                  ? "text-emerald-400"
                                  : (t.profit ?? 0) < 0
                                    ? "text-rose-400"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {(t.profit ?? 0) > 0 ? "+" : ""}
                              {fmt(t.profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---- Right column: ticket, stats, auto ---- */}
          <div className="space-y-4">
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Trade ticket</CardTitle>
                <CardDescription>Up/down binary contract · demo balance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Direction */}
                <div>
                  <Label className="field-label">Direction</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => deriv.setTicket({ contractType: "CALL" })}
                      className={`flex items-center justify-center gap-2 rounded-lg border py-3 font-semibold transition-all ${
                        deriv.ticket.contractType === "CALL"
                          ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/10"
                          : "border-border bg-background/40 text-muted-foreground hover:border-emerald-400/40"
                      }`}
                    >
                      <TrendingUp className="h-4 w-4" /> Rise
                    </button>
                    <button
                      type="button"
                      onClick={() => deriv.setTicket({ contractType: "PUT" })}
                      className={`flex items-center justify-center gap-2 rounded-lg border py-3 font-semibold transition-all ${
                        deriv.ticket.contractType === "PUT"
                          ? "border-rose-400/60 bg-rose-500/15 text-rose-300 shadow-lg shadow-rose-500/10"
                          : "border-border bg-background/40 text-muted-foreground hover:border-rose-400/40"
                      }`}
                    >
                      <TrendingDown className="h-4 w-4" /> Fall
                    </button>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <Label className="field-label">Duration</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {presets.map((p) => {
                      const active = deriv.ticket.duration === p.duration && deriv.ticket.durationUnit === p.unit;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => onSelectDuration(p.duration, p.unit)}
                          className={`rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/15 text-primary"
                              : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stake */}
                <div>
                  <Label className="field-label">Stake ({deriv.account?.currency ?? "USD"})</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={deriv.ticket.stake}
                    onChange={(e) => onStake(Number(e.target.value) || 0)}
                    className="mt-2 font-mono"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STAKE_PRESETS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onStake(s)}
                        className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                          deriv.ticket.stake === s
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payout preview */}
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  {deriv.proposal ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">If you win</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {fmt(deriv.proposal.payout)} {deriv.account?.currency ?? ""}
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{fmt(((deriv.proposal.payout - deriv.ticket.stake) / deriv.ticket.stake) * 100, 0)}%)
                        </span>
                      </span>
                    </div>
                  ) : deriv.proposalError ? (
                    <p className="text-xs text-rose-400">{deriv.proposalError}</p>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching quote…
                    </div>
                  )}
                </div>

                {lastTrade && (
                  <p className={`text-xs ${lastTrade.ok ? "text-emerald-400" : "text-rose-400"}`}>
                    {lastTrade.message}
                  </p>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={onPlaceTrade}
                  disabled={!connected || deriv.busy || !deriv.proposal}
                >
                  {deriv.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {deriv.ticket.contractType === "CALL" ? "Buy Rise" : "Buy Fall"}
                </Button>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {stats == null ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-14 rounded-lg shimmer-bar" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Win rate</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{stats.winRate}%</div>
                      <div className="text-[10px] text-muted-foreground">{stats.wins}W · {stats.losses}L · {stats.sold}S</div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net P/L</div>
                      <div className={`mt-1 font-mono text-lg font-semibold ${stats.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {stats.netProfit >= 0 ? "+" : ""}{fmt(stats.netProfit)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">staked {fmt(stats.totalStaked)}</div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{stats.total}</div>
                      <div className="text-[10px] text-muted-foreground">{stats.open} open now</div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto trades</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{stats.autoTrades}</div>
                      <div className="text-[10px] text-muted-foreground">best {fmt(stats.best)}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Auto-trader */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="h-4 w-4 text-primary" /> Auto-trader
                  </CardTitle>
                  <Switch
                    checked={settingsRow?.autoTrade ?? false}
                    onCheckedChange={(v) => updateSettings({ autoTrade: v }).catch(() => {})}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">
                  <Label className="field-label">Strategy</Label>
                  <Select
                    value={settingsRow?.strategy ?? "ema_cross"}
                    onValueChange={(v) =>
                      updateSettings({ strategy: v as "ema_cross" | "rsi" }).catch(() => {})
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ema_cross">EMA crossover</SelectItem>
                      <SelectItem value="rsi">RSI reversion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Current signal</span>
                    {deriv.signal ? (
                      <span
                        className={`font-mono font-semibold ${
                          deriv.signal.direction === "CALL" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {deriv.signal.direction === "CALL" ? "▲ RISE" : "▼ FALL"} · {(deriv.signal.strength * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">waiting…</span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {settingsRow?.strategy === "rsi"
                      ? `RSI ${deriv.indicator?.rsi != null ? deriv.indicator.rsi.toFixed(1) : "—"}`
                      : `EMA ${deriv.indicator?.fast != null ? deriv.indicator.fast.toFixed(3) : "—"} / ${deriv.indicator?.slow != null ? deriv.indicator.slow.toFixed(3) : "—"}`}
                  </div>
                </div>

                {deriv.lastAutoTrade && (
                  <p className={`text-xs ${deriv.lastAutoTrade.ok ? "text-emerald-400" : "text-rose-400"}`}>
                    {new Date(deriv.lastAutoTrade.at).toLocaleTimeString()} · {deriv.lastAutoTrade.message}
                  </p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  When enabled, the strategy places trades automatically using the ticket's symbol, duration and stake
                  (max one auto trade at a time). Experimental — demo funds only.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Settings */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="h-4 w-4 text-primary" /> Account &amp; settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-background/40 p-3">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-emerald-400" />
                      <span className="font-mono text-sm">{accountRow.loginId ?? "demo account"}</span>
                      {accountRow.currency && (
                        <Badge variant="outline" className="text-xs">{accountRow.currency}</Badge>
                      )}
                    </div>
                    <Button variant="destructive" size="sm" className="ml-auto" onClick={handleRemoveToken}>
                      <Trash2 className="h-3.5 w-3.5" /> Disconnect &amp; remove token
                    </Button>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Voltix connects to Deriv's WebSocket API with your demo token and executes contracts on your demo
                    account. Market data, quotes and settlement all come from Deriv — Voltix mirrors your trades so you
                    get history and stats here. This is a demo/educational tool: binary options are banned for retail
                    investors in many jurisdictions, and no strategy guarantees profits.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HeaderBar({
  connected,
  connecting,
  statusLabel,
  rightSlot,
  onToggleSettings,
  onSignOut,
}: {
  connected: boolean;
  connecting?: boolean;
  statusLabel: string;
  rightSlot?: React.ReactNode;
  onToggleSettings?: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <LinkBrand />
        <div
          className={`ml-1 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            connected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : connecting
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : connecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {statusLabel}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          {onToggleSettings && (
            <Button variant="ghost" size="icon" onClick={onToggleSettings} aria-label="Account settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

export function LinkBrand() {
  return (
    <a href="/" className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Activity className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="font-display text-lg font-bold tracking-wide">
        VOLTIX <span className="text-primary">TRADE</span>
      </span>
    </a>
  );
}
