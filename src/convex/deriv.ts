import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyAccount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("derivAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Upsert the user's Deriv API token and (once authorized) their login/currency.
 * The token is stored so the browser can open the Deriv WebSocket with it.
 */
export const saveAccount = mutation({
  args: {
    apiToken: v.optional(v.string()),
    loginId: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("derivAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.apiToken ? { apiToken: args.apiToken.trim() } : {}),
        ...(args.loginId ? { loginId: args.loginId } : {}),
        ...(args.currency ? { currency: args.currency } : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    if (!args.apiToken || args.apiToken.trim().length < 10) {
      throw new Error("That doesn't look like a valid Deriv API token.");
    }

    return await ctx.db.insert("derivAccounts", {
      userId,
      apiToken: args.apiToken.trim(),
      loginId: args.loginId,
      currency: args.currency,
      connectedAt: now,
      updatedAt: now,
    });
  },
});

export const removeAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("derivAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return true;
  },
});
