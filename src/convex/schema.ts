import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  }).index("email", ["email"]),

  // The user's Deriv demo API token (used to connect the WebSocket).
  derivAccounts: defineTable({
    userId: v.id("users"),
    apiToken: v.string(),
    loginId: v.optional(v.string()),
    currency: v.optional(v.string()),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Mirror of trades executed on the user's Deriv demo account, so the app can
  // show history + stats without replaying the broker API.
  trades: defineTable({
    userId: v.id("users"),
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
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_contract", ["userId", "contractId"])
    .index("by_user_time", ["userId", "buyTime"]),

  // Per-user trading preferences + auto-trade configuration.
  tradingSettings: defineTable({
    userId: v.id("users"),
    stake: v.number(),
    symbol: v.string(),
    duration: v.number(),
    durationUnit: v.string(),
    autoTrade: v.boolean(),
    strategy: v.union(v.literal("ema_cross"), v.literal("rsi")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
