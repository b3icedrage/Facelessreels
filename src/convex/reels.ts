import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const uid = (identity: { subject: string }) =>
  identity.subject.split("|")[0] as Id<"users">;

/** The current user's reels, newest first. */
export const listReels = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("reels")
      .withIndex("by_user_created", (q) => q.eq("userId", uid(identity)))
      .order("desc")
      .take(100);
  },
});

/**
 * Internal lookup used by scheduled pipeline actions (which have no auth
 * identity). Reel IDs are opaque, so only the pipeline can supply them.
 */
export const getReelInternal = query({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reelId);
  },
});

export const getReel = query({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const reel = await ctx.db.get(args.reelId);
    if (!reel || reel.userId !== uid(identity)) return null;
    return reel;
  },
});

/** Pipeline-internal: no auth identity on scheduled runs. */
export const setOperation = mutation({
  args: { reelId: v.id("reels"), operationName: v.string() },
  handler: async (ctx, args) => {
    const reel = await ctx.db.get(args.reelId);
    if (!reel) return;
    await ctx.db.patch(args.reelId, {
      operationName: args.operationName,
      status: "generating",
      updatedAt: Date.now(),
    });
  },
});

/** Pipeline-internal: no auth identity on scheduled runs. */
export const setRendered = mutation({
  args: {
    reelId: v.id("reels"),
    videoUri: v.string(),
    thumbnailUri: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reel = await ctx.db.get(args.reelId);
    if (!reel) return;
    await ctx.db.patch(args.reelId, {
      videoUri: args.videoUri,
      thumbnailUri: args.thumbnailUri,
      status: "rendered",
      updatedAt: Date.now(),
    });
  },
});

/** Pipeline-internal: no auth identity on scheduled runs. */
export const setStatus = mutation({
  args: {
    reelId: v.id("reels"),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("rendered"),
      v.literal("uploading"),
      v.literal("posted"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    const reel = await ctx.db.get(args.reelId);
    if (!reel) return;
    await ctx.db.patch(args.reelId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Pipeline-internal: no auth identity on scheduled runs. */
export const markFailed = mutation({
  args: { reelId: v.id("reels"), error: v.string() },
  handler: async (ctx, args) => {
    const reel = await ctx.db.get(args.reelId);
    if (!reel) return;
    await ctx.db.patch(args.reelId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    if (reel.sourceIdeaId) {
      await ctx.db.patch(reel.sourceIdeaId, { status: "queued" });
    }
  },
});

/** Pipeline-internal: no auth identity on scheduled runs. */
export const markPosted = mutation({
  args: {
    reelId: v.id("reels"),
    youtubeVideoId: v.string(),
    youtubeUrl: v.string(),
    postedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const reel = await ctx.db.get(args.reelId);
    if (!reel) return;
    await ctx.db.patch(args.reelId, {
      youtubeVideoId: args.youtubeVideoId,
      youtubeUrl: args.youtubeUrl,
      postedAt: args.postedAt,
      status: "posted",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Create a manual reel from a prompt and start generating it right away.
 */
export const createManualReel = mutation({
  args: {
    prompt: v.string(),
    aspectRatio: v.string(),
    durationSeconds: v.number(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = uid(identity);

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const title = args.title?.trim() || args.prompt.slice(0, 60);
    const now = Date.now();
    const reelId = await ctx.db.insert("reels", {
      userId,
      prompt: args.prompt,
      title,
      description: args.prompt,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      status: "queued",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, api.veo.startVeoGenerationAction, {
      prompt: args.prompt,
      aspectRatio: settings?.aspectRatio || args.aspectRatio,
      durationSeconds: settings?.durationSeconds || args.durationSeconds,
      title,
      description: args.prompt,
      reelId,
    });
    return reelId;
  },
});

/** Re-try a failed or rendered reel from scratch. */
export const retryReel = mutation({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const reel = await ctx.db.get(args.reelId);
    if (!reel || reel.userId !== uid(identity)) return;
    if (reel.status !== "failed" && reel.status !== "rendered") return;

    await ctx.db.patch(args.reelId, {
      status: "queued",
      error: undefined,
      operationName: undefined,
      videoUri: undefined,
      thumbnailUri: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, api.veo.startVeoGenerationAction, {
      prompt: reel.prompt,
      aspectRatio: reel.aspectRatio,
      durationSeconds: reel.durationSeconds,
      title: reel.title,
      description: reel.description,
      reelId: args.reelId,
    });
  },
});

/** Manually push a rendered reel to YouTube right now. */
export const postNow = mutation({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const reel = await ctx.db.get(args.reelId);
    if (!reel || reel.userId !== uid(identity)) return;
    if (reel.status !== "rendered") return;
    await ctx.scheduler.runAfter(0, api.youtube_actions.uploadReel, {
      reelId: args.reelId,
    });
  },
});

export const deleteReel = mutation({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const reel = await ctx.db.get(args.reelId);
    if (!reel || reel.userId !== uid(identity)) return;
    await ctx.db.delete(args.reelId);
  },
});

// ---- Content idea queue (for the fully automatic pipeline) ----

export const listIdeas = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("contentIdeas")
      .withIndex("by_user_created", (q) => q.eq("userId", uid(identity)))
      .order("desc")
      .take(100);
  },
});

export const addIdea = mutation({
  args: { prompt: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (args.prompt.trim().length < 10) {
      throw new Error("Prompt must be at least 10 characters.");
    }
    return await ctx.db.insert("contentIdeas", {
      userId: uid(identity),
      prompt: args.prompt.trim(),
      title: args.title?.trim() || undefined,
      status: "queued",
      createdAt: Date.now(),
    });
  },
});

export const removeIdea = mutation({
  args: { ideaId: v.id("contentIdeas") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.userId !== uid(identity)) return;
    await ctx.db.delete(args.ideaId);
  },
});
