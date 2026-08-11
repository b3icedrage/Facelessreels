import { useMemo } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CandlestickChart,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wifi,
  Zap,
} from "lucide-react";

import { LinkBrand } from "@/pages/TradingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const TICKER_ITEMS = [
  { sym: "R_100", name: "Volatility 100", price: 6321.84, up: true },
  { sym: "R_75", name: "Volatility 75", price: 9102.47, up: false },
  { sym: "1HZ100V", name: "Jump 100", price: 4412.09, up: true },
  { sym: "frxEURUSD", name: "EUR/USD (OTC)", price: 1.0842, up: false },
  { sym: "cryBTCUSD", name: "BTC/USD (OTC)", price: 67432.1, up: true },
  { sym: "R_200", name: "Volatility 200", price: 1840.33, up: true },
  { sym: "cryETHUSD", name: "ETH/USD (OTC)", price: 3512.76, up: false },
  { sym: "frxGBPUSD", name: "GBP/USD (OTC)", price: 1.2719, up: true },
];

function HeroChart() {
  const points = useMemo(() => {
    const seed = [0.42, 0.38, 0.46, 0.44, 0.52, 0.5, 0.58, 0.55, 0.63, 0.6, 0.7, 0.66, 0.74, 0.71, 0.8, 0.77, 0.85, 0.82, 0.9, 0.87];
    return seed.map((v, i) => ({
      x: 12 + i * 38,
      y: 190 - v * 150,
    }));
  }, []);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox="0 0 780 260" className="w-full" aria-hidden="true">
      <defs>
        <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="55%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <line
          key={f}
          x1="0"
          x2="780"
          y1={f * 230}
          y2={f * 230}
          stroke="hsl(224 14% 16%)"
          strokeDasharray="4 6"
        />
      ))}
      <path d={`${line} L${points[points.length - 1].x},250 L${points[0].x},250 Z`} fill="url(#heroArea)" />
      <motion.path
        d={line}
        fill="none"
        stroke="url(#heroLine)"
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.8, ease: "easeInOut" }}
      />
      <motion.circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="5"
        fill="#10b981"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: [1, 1.6, 1] }}
        transition={{ delay: 1.6, duration: 0.6, repeat: Infinity, repeatDelay: 1.2 }}
      />
    </svg>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useConvexAuth();
  const ctaHref = isAuthenticated ? "/trading" : "/auth?returnTo=/trading";

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <LinkBrand />
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden items-center gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              Markets live via Deriv
            </Badge>
            <Button asChild variant="ghost" size="sm">
              <Link to={ctaHref}>Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={ctaHref}>
                Launch terminal <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="terminal-grid relative">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
                <Badge className="mb-5 gap-1.5 border-primary/30 bg-primary/10 py-1 text-primary">
                  <Sparkles className="h-3 w-3" /> Demo terminal · powered by Deriv
                </Badge>
              </motion.div>
              <motion.h1
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={1}
                className="font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl"
              >
                Trade binary options on <span className="text-gradient">live markets</span>. Zero risk.
              </motion.h1>
              <motion.p
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={2}
                className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg"
              >
                Voltix plugs into your Deriv <span className="text-emerald-400">demo account</span> — real prices,
                real order execution, real settlement mechanics, but 100% virtual funds. Practice rise/fall
                contracts, run auto-trading signals, and study your P/L without risking a cent.
              </motion.p>
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={3}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button asChild size="lg" className="shadow-2xl shadow-primary/25">
                  <Link to={ctaHref}>
                    Open demo terminal <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to={ctaHref}>
                    <Wifi className="h-4 w-4" /> Connect Deriv demo
                  </Link>
                </Button>
              </motion.div>
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={4}
                className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> No real money involved</span>
                <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" /> Live synthetic, forex &amp; crypto feeds</span>
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400" /> Auto-trading signal engine</span>
              </motion.div>
            </div>

            {/* Terminal mock */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="relative"
            >
              <div className="absolute -inset-6 rounded-3xl bg-primary/10 blur-3xl" />
              <div className="glass relative rounded-2xl p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">R_100 · Volatility 100 Index</span>
                  <span className="font-mono text-xs font-semibold text-emerald-400">▲ 6,321.84</span>
                </div>
                <HeroChart />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400">
                      <TrendingUp className="h-3 w-3" /> Rise · 1m
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-emerald-300">
                      Stake 10 → win 19.7
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-400">
                      <BarChart3 className="h-3 w-3" /> P/L today
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-rose-300">+24.3 · 68% win rate</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Ticker tape */}
      <section className="border-y border-border/50 bg-background/60">
        <div className="flex overflow-hidden">
          <div className="flex min-w-full shrink-0 animate-marquee items-center gap-10 py-3 pr-10">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <div key={i} className="flex shrink-0 items-center gap-2 font-mono text-xs">
                <span className="text-foreground">{t.sym}</span>
                <span className="text-muted-foreground">{t.name}</span>
                <span className={t.up ? "text-emerald-400" : "text-rose-400"}>
                  {t.up ? "▲" : "▼"} {t.price.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          custom={0}
          className="mx-auto max-w-2xl text-center"
        >
          <Badge variant="outline" className="mb-4 text-primary">What you get</Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            A serious trading terminal, <span className="text-gradient">minus the risk</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to practice binary options trading the way it actually works — live data and
            real execution, on demo money.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: LineChart,
              title: "Live market charts",
              body: "Tick-by-tick price charts for synthetic indices, OTC forex and OTC crypto — streamed straight from Deriv in real time.",
            },
            {
              icon: CandlestickChart,
              title: "Rise & fall contracts",
              body: "Choose your market, duration (15s to 4h) and stake, then buy Rise or Fall with a live payout preview before you commit.",
            },
            {
              icon: Zap,
              title: "Auto-trading signals",
              body: "A built-in signal engine (EMA crossover or RSI) can watch the market and place trades for you automatically while you watch.",
            },
            {
              icon: BarChart3,
              title: "Full P/L analytics",
              body: "Win rate, net profit, biggest wins and losses — computed from your actual settled contracts, not a marketing dashboard.",
            },
            {
              icon: ShieldCheck,
              title: "Demo funds only",
              body: "Every trade runs on the virtual balance of your Deriv demo account. No deposit, no withdrawal, no way to lose real money.",
            },
            {
              icon: Wifi,
              title: "Your token, your account",
              body: "Bring your own free Deriv API token. It's stored on your account and only your browser ever talks to Deriv with it.",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              className="glass group rounded-xl p-6 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary transition-transform group-hover:scale-110">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-background/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge variant="outline" className="mb-4 text-primary">Get started in 3 minutes</Badge>
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                From zero to trading — <span className="text-gradient">no setup fees</span>
              </h2>
              <div className="mt-8 space-y-6">
                {[
                  {
                    n: "01",
                    t: "Create a free Deriv account",
                    b: "Sign up at deriv.com and open a demo account — you get a virtual balance instantly, no deposit.",
                  },
                  {
                    n: "02",
                    t: "Generate an API token",
                    b: "In Deriv, go to Settings → API token and create a token for your demo account. Copy it.",
                  },
                  {
                    n: "03",
                    t: "Paste it into Voltix",
                    b: "The terminal connects, loads live markets, and you can place your first Rise/Fall contract immediately.",
                  },
                ].map((s, i) => (
                  <motion.div
                    key={s.n}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                    custom={i}
                    className="flex gap-4"
                  >
                    <span className="font-mono text-2xl font-semibold text-primary/50">{s.n}</span>
                    <div>
                      <h3 className="font-display text-base font-semibold">{s.t}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">demo terminal</span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" /> live
                </span>
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between rounded-md bg-background/50 px-3 py-2">
                  <span className="text-muted-foreground">balance</span>
                  <span className="font-semibold text-emerald-400">$10,000.00 USD</span>
                </div>
                <div className="flex justify-between rounded-md bg-background/50 px-3 py-2">
                  <span className="text-muted-foreground">contract</span>
                  <span>R_100 · Rise · 1m · stake $10</span>
                </div>
                <div className="flex justify-between rounded-md bg-background/50 px-3 py-2">
                  <span className="text-muted-foreground">win payout</span>
                  <span className="text-emerald-400">$19.70</span>
                </div>
                <div className="flex justify-between rounded-md bg-background/50 px-3 py-2">
                  <span className="text-muted-foreground">status</span>
                  <span className="text-amber-400">in progress · 0:42 left</span>
                </div>
                <div className="flex justify-between rounded-md bg-emerald-500/10 px-3 py-2">
                  <span className="text-muted-foreground">settled</span>
                  <span className="font-semibold text-emerald-400">+$9.70 profit</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="terminal-grid">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            custom={0}
          >
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
              Your demo account is <span className="text-gradient">already funded</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Bring the token, open the terminal, and see how binary options actually behave — without risking
              anything you earned.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg" className="shadow-2xl shadow-primary/25">
                <Link to={ctaHref}>
                  Open demo terminal <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="mx-auto max-w-6xl space-y-4 px-4 text-center">
          <LinkBrand />
          <p className="mx-auto max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Voltix is a demo/educational tool. It connects to Deriv's WebSocket API and trades exclusively on the
            virtual balance of your Deriv demo account — no real money is ever used, deposited or withdrawn. Binary
            options trading is banned for retail investors in many jurisdictions (including the EU, UK, Australia and
            Canada), and no trading strategy guarantees profits. Nothing here is financial advice.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Built on React · Convex · Deriv API · app_id 1089 (testing)
          </p>
        </div>
      </footer>
    </div>
  );
}
