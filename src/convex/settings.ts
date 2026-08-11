import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const DEFAULT_SETTINGS = {
  stake: 10,
  symbol: "R_100",
  duration: 1,
  durationUnit: "m",
  autoTrade: false,
  strategy: "ema_cross" as const,
};

export const getMySettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("tradingSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row;
  },
});

export const updateSettings = mutation({
  args: {
    stake: v.optional(v.number()),
    symbol: v.optional(v.string()),
    duration: v.optional(v.number()),
    durationUnit: v.optional(v.string()),
    autoTrade: v.optional(v.boolean()),
    strategy: v.optional(v.union(v.literal("ema_cross"), v.literal("rsi"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("tradingSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();

    const patch = {
      ...(args.stake !== undefined ? { stake: Math.max(0.5, Math.min(10000, args.stake)) } : {}),
      ...(args.symbol ? { symbol: args.symbol } : {}),
      ...(args.duration !== undefined ? { duration: Math.max(1, args.duration) } : {}),
      ...(args.durationUnit ? { durationUnit: args.durationUnit } : {}),
      ...(args.autoTrade !== undefined ? { autoTrade: args.autoTrade } : {}),
      ...(args.strategy ? { strategy: args.strategy } : {}),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("tradingSettings", {
      userId,
      ...DEFAULT_SETTINGS,
      ...patch,
      createdAt: now,
      updatedAt: now,
    } as any);
  },
});
