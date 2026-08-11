/**
 * Minimal Deriv WebSocket API client.
 *
 * Endpoint: wss://ws.derivws.com/websockets/v3?app_id=<app_id>
 * app_id 1089 is Deriv's official testing app id.
 *
 * The client is browser-side: the user's demo API token is fetched from
 * Convex and used to authorize the socket. All market data + trading calls
 * require an authorized connection.
 */

export const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
export const DERIV_APP_ID = 1089;

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface TickPoint {
  epoch: number;
  quote: number;
}

export interface SymbolInfo {
  symbol: string;
  display: string;
  market: string;
  submarket?: string;
}

export interface AccountInfo {
  loginid: string;
  currency: string;
  balance: number;
  email?: string;
}

export interface ProposalInfo {
  id: string;
  askPrice: number;
  payout: number;
  longcode: string;
  spot: number;
}

export interface OpenContractInfo {
  contractId: number;
  symbol: string;
  contractType: string;
  longcode: string;
  buyPrice: number;
  payout?: number;
  purchaseTime: number;
  dateExpiry?: number;
}

export interface TxEvent {
  action: string;
  amount: number;
  balance: number;
  contractId?: number;
  longcode?: string;
  transactionId: number;
  purchaseTime?: number;
}

export interface ProposalParams {
  amount: number;
  basis: "stake";
  contract_type: "CALL" | "PUT";
  currency: string;
  duration: number;
  duration_unit: "s" | "m" | "h" | "d";
  symbol: string;
}

type Pending = { resolve: (m: any) => void; reject: (e: Error) => void };

interface ActiveSub {
  key: string;
  msgType: string;
  payload: Record<string, unknown>;
  handler: (m: any) => void;
  subId: string | null;
}

type Handler = (m: any) => void;

export class DerivClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reqId = 0;
  private pending = new Map<number, Pending>();
  private subs = new Map<string, ActiveSub>();
  private status: ConnectionStatus = "idle";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private closedByUser = false;
  private eventHandlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    const set = this.eventHandlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.eventHandlers.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  private emit(event: string, payload: any) {
    const set = this.eventHandlers.get(event);
    if (set) for (const h of set) h(payload);
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.emit("status", s);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(token: string) {
    if (this.token !== token || !this.ws || this.ws.readyState > WebSocket.OPEN) {
      this.token = token;
      this.closedByUser = false;
      this.open();
    }
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.token = null;
    this.subs.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.pending.forEach((p) => p.reject(new Error("Disconnected")));
    this.pending.clear();
    this.setStatus("idle");
  }

  private open() {
    this.setStatus("connecting");
    const ws = new WebSocket(DERIV_WS_URL);
    this.ws = ws;
    ws.onopen = () => this.onOpen(ws);
    ws.onmessage = (e) => this.onMessage(e.data as string);
    ws.onclose = () => this.onClose();
    ws.onerror = () => {
      /* close follows */
    };
  }

  private async onOpen(ws: WebSocket) {
    if (!this.token) return;
    try {
      const res = await this.request({ authorize: this.token });
      if (res.error) {
        this.emit("error", res.error);
        this.setStatus("error");
        ws.close();
        return;
      }
      this.backoff = 1000;
      this.setStatus("connected");
      this.emit("authorize", res.authorize);
      // Re-send all active subscriptions after (re)connect.
      for (const sub of this.subs.values()) {
        sub.subId = null;
        ws.send(JSON.stringify(sub.payload));
      }
    } catch (e) {
      this.emit("error", { message: (e as Error).message });
      this.setStatus("error");
    }
  }

  private onClose() {
    if (this.closedByUser) return;
    this.setStatus("connecting");
    this.reconnectTimer = setTimeout(() => {
      this.open();
      this.backoff = Math.min(this.backoff * 2, 30000);
    }, this.backoff);
  }

  private onMessage(data: string) {
    let m: any;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.req_id && this.pending.has(m.req_id)) {
      const p = this.pending.get(m.req_id)!;
      this.pending.delete(m.req_id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m);
      return;
    }
    this.dispatch(m);
  }

  private dispatch(m: any) {
    switch (m.msg_type) {
      case "tick": {
        const sub = this.subs.get("ticks");
        if (sub && m.tick && (sub.payload.symbol === m.ticks || !m.ticks)) {
          this.captureSubId(sub, m);
          sub.handler(m);
        }
        break;
      }
      case "balance": {
        const sub = this.subs.get("balance");
        if (sub) {
          this.captureSubId(sub, m);
          sub.handler(m);
        }
        break;
      }
      case "transaction": {
        const sub = this.subs.get("transaction");
        if (sub) {
          this.captureSubId(sub, m);
          sub.handler(m);
        }
        break;
      }
      case "proposal": {
        const sub = this.subs.get("proposal");
        if (sub) {
          this.captureSubId(sub, m);
          sub.handler(m);
        }
        break;
      }
      case "proposal_open_contract": {
        const id = m.echo_req?.contract_id;
        const sub = id != null ? this.subs.get(`poc:${id}`) : null;
        if (sub) {
          this.captureSubId(sub, m);
          sub.handler(m);
        }
        break;
      }
      case "error": {
        this.emit("error", m.error ?? m);
        break;
      }
      default:
        break;
    }
  }

  private captureSubId(sub: ActiveSub, m: any) {
    if (m.subscription?.id && sub.subId !== m.subscription.id) {
      sub.subId = m.subscription.id;
    }
  }

  /** One-shot request with req_id correlation. Rejects with the API error message. */
  request(payload: Record<string, unknown>): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to Deriv"));
    }
    const req_id = ++this.reqId;
    return new Promise((resolve, reject) => {
      this.pending.set(req_id, { resolve, reject });
      this.ws!.send(JSON.stringify({ ...payload, req_id }));
      setTimeout(() => {
        if (this.pending.delete(req_id)) {
          reject(new Error("Request timed out"));
        }
      }, 15000);
    });
  }

  private addSub(key: string, msgType: string, payload: Record<string, unknown>, handler: Handler) {
    const existing = this.subs.get(key);
    if (existing) {
      this.forgetSub(existing);
    }
    const sub: ActiveSub = { key, msgType, payload, handler, subId: null };
    this.subs.set(key, sub);
    this.ws?.send(JSON.stringify(payload));
    return () => {
      const current = this.subs.get(key);
      if (current === sub) {
        this.forgetSub(sub);
        this.subs.delete(key);
      }
    };
  }

  private forgetSub(sub: ActiveSub) {
    if (sub.subId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ forget: sub.subId }));
    }
    sub.subId = null;
  }

  subscribeTicks(symbol: string, handler: (m: any) => void) {
    return this.addSub("ticks", "tick", { ticks: symbol, subscribe: 1 }, handler);
  }

  subscribeBalance(handler: (m: any) => void) {
    return this.addSub("balance", "balance", { balance: 1, subscribe: 1 }, handler);
  }

  subscribeTransaction(handler: (m: any) => void) {
    return this.addSub("transaction", "transaction", { transaction: 1, subscribe: 1 }, handler);
  }

  subscribeProposal(params: ProposalParams, handler: (m: any) => void) {
    return this.addSub(
      "proposal",
      "proposal",
      { proposal: 1, ...params, subscribe: 1 },
      handler,
    );
  }

  subscribeContract(contractId: number, handler: (m: any) => void) {
    return this.addSub(
      `poc:${contractId}`,
      "proposal_open_contract",
      { proposal_open_contract: 1, contract_id: contractId, subscribe: 1 },
      handler,
    );
  }

  async fetchSymbols(): Promise<SymbolInfo[]> {
    const res = await this.request({ active_symbols: "brief" });
    if (!res.active_symbols) return [];
    return res.active_symbols.map((s: any) => ({
      symbol: s.symbol,
      display: s.display_name,
      market: s.market,
      submarket: s.submarket,
    }));
  }

  async fetchPortfolio(): Promise<OpenContractInfo[]> {
    const res = await this.request({ portfolio: 1 });
    const contracts = res.portfolio?.contracts ?? [];
    return contracts.map((c: any) => ({
      contractId: c.contract_id,
      symbol: c.symbol,
      contractType: c.contract_type,
      longcode: c.longcode,
      buyPrice: c.buy_price,
      payout: c.payout,
      purchaseTime: c.purchase_time,
      dateExpiry: c.date_expiry,
    }));
  }

  async fetchProfitTable(limit = 50): Promise<any[]> {
    const res = await this.request({ profit_table: 1, limit });
    return res.profit_table?.transactions ?? [];
  }
}
