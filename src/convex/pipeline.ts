import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { extractVideoFromOperation, pollVeoOperation } from "./veo";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 60; // ~15 minutes

/**
 * Polls the Veo long-running operation for a reel. When it completes,
 * marks the reel rendered and, if the user wants auto-posting, starts
 * the YouTube upload.
 */
export const pollReel = action({
  args: {
    reelId: v.id("reels"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.attempt > MAX_POLL_ATTEMPTS) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "Video generation timed out.",
      });
      return;
    }

    const reel = await ctx.runQuery(api.reels.getReelInternal, {
      reelId: args.reelId,
    });
    if (!reel || !reel.operationName) return;
    if (reel.status === "failed" || reel.status === "posted") return;

    let body: Record<string, any>;
    try {
      body = await pollVeoOperation(reel.operationName);
    } catch (e: any) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: e?.message || "Failed polling video generation.",
      });
      return;
    }

    if (!body.done) {
      await ctx.scheduler.runAfter(POLL_INTERVAL_MS, api.pipeline.pollReel, {
        reelId: args.reelId,
        attempt: args.attempt + 1,
      });
      return;
    }

    if (body.error) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: body.error.message || "Video generation failed.",
      });
      return;
    }

    const { videoUri, thumbnailUri } = extractVideoFromOperation(body);
    if (!videoUri) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "Veo completed but no video URI was returned.",
      });
      return;
    }

    await ctx.runMutation(api.reels.setRendered, {
      reelId: args.reelId,
      videoUri,
      thumbnailUri,
    });

    // Decide whether to upload automatically.
    const shouldPost = await ctx.runQuery(api.settings.shouldAutoPost, {
      userId: reel.userId,
    });
    if (shouldPost) {
      await ctx.runAction(api.youtube_actions.uploadReel, { reelId: args.reelId });
    }
  },
});

/** Generate a title from the settings template, falling back to the prompt. */
export function applyTitleTemplate(template: string, prompt: string, fallback: string) {
  if (!template.trim()) return fallback;
  return template
    .replaceAll("{title}", fallback)
    .replaceAll("{prompt}", prompt)
    .slice(0, 100);
}

export function applyDescriptionTemplate(template: string, prompt: string, title: string) {
  if (!template.trim()) return prompt;
  return template
    .replaceAll("{title}", title)
    .replaceAll("{prompt}", prompt)
    .slice(0, 5000);
}

/**
 * The fully automatic pipeline: for every user with autoPost enabled, a
 * connected YouTube account, and no job in flight, take the next queued
 * idea and start generating it (respecting the posting interval).
 */
export const runAutoPipeline = mutation({
  args: {},
  handler: async (ctx) => {
    const autoSettings = await ctx.db
      .query("settings")
      .withIndex("by_autoPost", (q) => q.eq("autoPost", true))
      .collect();

    for (const settings of autoSettings) {
      const account = await ctx.db
        .query("youtubeAccounts")
        .withIndex("by_user", (q) => q.eq("userId", settings.userId))
        .first();
      if (!account) continue;

      // Skip if a reel is already in flight.
      const inFlight = await ctx.db
        .query("reels")
        .withIndex("by_user", (q) => q.eq("userId", settings.userId))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "queued"),
            q.eq(q.field("status"), "generating"),
            q.eq(q.field("status"), "rendered"),
            q.eq(q.field("status"), "uploading"),
          ),
        )
        .first();
      if (inFlight) continue;

      // Respect the posting interval.
      const now = Date.now();
      const lastPosted = settings.lastPostedAt ?? settings.createdAt;
      if (now - lastPosted < settings.intervalMinutes * 60_000) continue;

      // Grab the next queued idea.
      const idea = await ctx.db
        .query("contentIdeas")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", settings.userId).eq("status", "queued"),
        )
        .first();
      if (!idea) continue;

      const title = idea.title || applyTitleTemplate(settings.titleTemplate, idea.prompt, idea.prompt.slice(0, 60));
      const description = applyDescriptionTemplate(settings.descriptionTemplate, idea.prompt, title);

      const reelId = await ctx.db.insert("reels", {
        userId: settings.userId,
        prompt: idea.prompt,
        title,
        description,
        aspectRatio: settings.aspectRatio,
        durationSeconds: settings.durationSeconds,
        status: "queued",
        sourceIdeaId: idea._id,
        source: "auto",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(idea._id, { status: "in_progress" });

      await ctx.scheduler.runAfter(0, api.veo.startVeoGenerationAction, {
        prompt: idea.prompt,
        aspectRatio: settings.aspectRatio,
        durationSeconds: settings.durationSeconds,
        title,
        description,
        reelId,
      });
    }
  },
});
