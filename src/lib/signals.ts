/**
 * Simple signal engines that turn a live tick stream into binary
 * (CALL/PUT) signals. Purely educational — no strategy is profitable,
 * and this runs against demo funds only.
 */

export type SignalDirection = "CALL" | "PUT";

export interface SignalEvent {
  direction: SignalDirection;
  strength: number; // 0..1 rough confidence
  at: number; // epoch of the triggering tick
}

export type StrategyName = "ema_cross" | "rsi";

function ema(values: number[]): number {
  const k = 2 / (values.length + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/** Fast/slow EMA crossover on tick closes, with hysteresis to avoid chatter. */
export class EmaCrossEngine {
  private fast: number[] = [];
  private slow: number[] = [];
  private prevFast = 0;
  private prevSlow = 0;
  private state: SignalDirection | null = null;

  constructor(
    private fastLen = 5,
    private slowLen = 13,
    private hysteresis = 0.00004,
  ) {}

  onTick(price: number, epoch: number): SignalEvent | null {
    this.fast.push(price);
    this.slow.push(price);
    if (this.fast.length > this.fastLen) this.fast.shift();
    if (this.slow.length > this.slowLen) this.slow.shift();
    if (this.fast.length < this.fastLen || this.slow.length < this.slowLen) return null;

    const f = ema(this.fast);
    const s = ema(this.slow);
    const crossedUp = this.prevFast <= this.prevSlow && f > s;
    const crossedDown = this.prevFast >= this.prevSlow && f < s;
    this.prevFast = f;
    this.prevSlow = s;

    if (!crossedUp && !crossedDown) return null;

    const diff = (f - s) / price;
    if (crossedUp && diff > this.hysteresis && this.state !== "CALL") {
      this.state = "CALL";
      return { direction: "CALL", strength: Math.min(1, diff / 0.001), at: epoch };
    }
    if (crossedDown && diff < -this.hysteresis && this.state !== "PUT") {
      this.state = "PUT";
      return { direction: "PUT", strength: Math.min(1, -diff / 0.001), at: epoch };
    }
    return null;
  }

  snapshot() {
    return {
      fast: this.prevFast || null,
      slow: this.prevSlow || null,
      diff: this.prevFast && this.prevSlow ? this.prevFast - this.prevSlow : null,
    };
  }

  reset() {
    this.fast = [];
    this.slow = [];
    this.prevFast = 0;
    this.prevSlow = 0;
    this.state = null;
  }
}

/** RSI mean-reversion: oversold -> CALL, overbought -> PUT. */
export class RsiEngine {
  private prices: number[] = [];
  private state: SignalDirection | null = null;
  private rsi = 50;

  constructor(
    private period = 14,
    private oversold = 30,
    private overbought = 70,
  ) {}

  onTick(price: number, epoch: number): SignalEvent | null {
    this.prices.push(price);
    if (this.prices.length > this.period + 1) this.prices.shift();
    if (this.prices.length < this.period + 1) return null;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i < this.prices.length; i++) {
      const d = this.prices[i] - this.prices[i - 1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    const avgG = gains / this.period;
    const avgL = losses / this.period;
    const rsi = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    this.rsi = rsi;

    if (this.state !== "CALL" && rsi < this.oversold) {
      this.state = "CALL";
      return {
        direction: "CALL",
        strength: Math.min(1, Math.max(0, (this.oversold - rsi) / 30)),
        at: epoch,
      };
    }
    if (this.state !== "PUT" && rsi > this.overbought) {
      this.state = "PUT";
      return {
        direction: "PUT",
        strength: Math.min(1, Math.max(0, (rsi - this.overbought) / 30)),
        at: epoch,
      };
    }
    return null;
  }

  snapshot() {
    return { rsi: this.rsi };
  }

  reset() {
    this.prices = [];
    this.state = null;
    this.rsi = 50;
  }
}

export type SignalEngine = EmaCrossEngine | RsiEngine;

export function createEngine(strategy: StrategyName): SignalEngine {
  return strategy === "ema_cross" ? new EmaCrossEngine() : new RsiEngine();
}
