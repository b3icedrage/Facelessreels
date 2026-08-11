import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordTrade = mutation({
  args: {
    contractId: v.string(),
    symbol: v.string(),
    contractType: v.union(v.literal("CALL"), v.literal("PUT")),
    duration: v.number(),
    durationUnit: v.string(),
    stake: v.number(),
    payout: v.number(),
    currency: v.string(),
    status: v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("sold")),
    profit: v.optional(v.number()),
    entrySpot: v.optional(v.number()),
    exitSpot: v.optional(v.number()),
    longcode: v.optional(v.string()),
    buyTime: v.number(),
    sellTime: v.optional(v.number()),
    source: v.union(v.literal("manual"), v.literal("auto")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("trades")
      .withIndex("by_user_contract", (q) =>
        q.eq("userId", userId).eq("contractId", args.contractId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        profit: args.profit,
        exitSpot: args.exitSpot,
        sellTime: args.sellTime,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("trades", {
      userId,
      contractId: args.contractId,
      symbol: args.symbol,
      contractType: args.contractType,
      duration: args.duration,
      durationUnit: args.durationUnit,
      stake: args.stake,
      payout: args.payout,
      currency: args.currency,
      status: args.status,
      profit: args.profit,
      entrySpot: args.entrySpot,
      exitSpot: args.exitSpot,
      longcode: args.longcode,
      buyTime: args.buyTime,
      sellTime: args.sellTime,
      source: args.source,
      updatedAt: now,
    });
  },
});

export const getMyTrades = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 20);
    return trades;
  },
});

export const getMyStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const closed = trades.filter((t) => t.status !== "open");
    const wins = closed.filter((t) => t.status === "won");
    const losses = closed.filter((t) => t.status === "lost");
    const sold = closed.filter((t) => t.status === "sold");

    const netProfit = closed.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    const totalStaked = closed.reduce((sum, t) => sum + t.stake, 0);
    const best = closed.reduce((max, t) => Math.max(max, t.profit ?? 0), 0);
    const worst = closed.reduce((min, t) => Math.min(min, t.profit ?? 0), 0);

    return {
      total: closed.length,
      wins: wins.length,
      losses: losses.length,
      sold: sold.length,
      open: trades.filter((t) => t.status === "open").length,
      winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
      netProfit: Math.round(netProfit * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      best: Math.round(best * 100) / 100,
      worst: Math.round(worst * 100) / 100,
      autoTrades: trades.filter((t) => t.source === "auto").length,
    };
  },
});
