import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const uid = (identity: { subject: string }) =>
  identity.subject.split("|")[0] as Id<"users">;

export const DEFAULT_SETTINGS = {
  autoPost: true,
  intervalMinutes: 240, // every 4 hours
  privacyStatus: "private" as const,
  aspectRatio: "9:16",
  durationSeconds: 8,
  titleTemplate: "{title}",
  descriptionTemplate: "{prompt}\n\n#shorts #ai #faceless",
};

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", uid(identity)))
      .first();
    if (!settings) return null;
    return settings;
  },
});

/**
 * Whether a rendered reel should be auto-uploaded for this user.
 * Internal (no auth check): called from scheduled pipeline actions.
 */
export const shouldAutoPost = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("youtubeAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
      .first();
    if (!account) return false;
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
      .first();
    return settings?.autoPost ?? true;
  },
});

export const ensureSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = uid(identity);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing;
    const now = Date.now();
    return await ctx.db.insert("settings", {
      userId,
      ...DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSettings = mutation({
  args: {
    autoPost: v.optional(v.boolean()),
    intervalMinutes: v.optional(v.number()),
    privacyStatus: v.optional(
      v.union(v.literal("public"), v.literal("unlisted"), v.literal("private")),
    ),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    titleTemplate: v.optional(v.string()),
    descriptionTemplate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = uid(identity);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    if (!existing) {
      return await ctx.db.insert("settings", {
        userId,
        ...DEFAULT_SETTINGS,
        ...args,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    return existing._id;
  },
});
