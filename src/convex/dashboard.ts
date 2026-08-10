import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const uid = (identity: { subject: string }) =>
  identity.subject.split("|")[0] as Id<"users">;

export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = uid(identity);

    const [reels, ideas, account, settings] = await Promise.all([
      ctx.db
        .query("reels")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .take(50),
      ctx.db
        .query("contentIdeas")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100),
      ctx.db
        .query("youtubeAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    ]);

    const queuedIdeas = ideas.filter((i) => i.status === "queued").length;
    const inFlight = reels.filter((r) =>
      ["queued", "generating", "rendered", "uploading"].includes(r.status),
    ).length;

    const now = Date.now();
    const lastPosted = settings?.lastPostedAt ?? settings?.createdAt;
    const nextDue = settings
      ? Math.max(0, (lastPosted ?? now) + settings.intervalMinutes * 60_000 - now)
      : null;

    return {
      reels,
      ideas,
      youtube: account
        ? {
            channelId: account.channelId,
            channelTitle: account.channelTitle,
            channelThumbnail: account.channelThumbnail,
            connectedAt: account.connectedAt,
          }
        : null,
      settings,
      stats: {
        posted: reels.filter((r) => r.status === "posted").length,
        queuedIdeas,
        inFlight,
        nextDueMs: nextDue,
        autoPost: settings?.autoPost ?? true,
      },
    };
  },
});
