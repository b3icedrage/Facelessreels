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

  // A connected YouTube channel per user (OAuth tokens).
  youtubeAccounts: defineTable({
    userId: v.id("users"),
    channelId: v.string(),
    channelTitle: v.string(),
    channelThumbnail: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
    connectedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_channel", ["channelId"]),

  // One-time OAuth state tokens for the YouTube connect flow.
  oauthStates: defineTable({
    state: v.string(),
    redirectUri: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  // The user's content queue — ideas the automatic pipeline works through.
  contentIdeas: defineTable({
    userId: v.id("users"),
    prompt: v.string(),
    title: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("in_progress"),
      v.literal("posted"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"]),

  // One video-generation + publish job per reel.
  reels: defineTable({
    userId: v.id("users"),
    prompt: v.string(),
    title: v.string(),
    description: v.string(),
    aspectRatio: v.string(),
    durationSeconds: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("rendered"),
      v.literal("uploading"),
      v.literal("posted"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    operationName: v.optional(v.string()),
    videoUri: v.optional(v.string()),
    thumbnailUri: v.optional(v.string()),
    youtubeVideoId: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    sourceIdeaId: v.optional(v.id("contentIdeas")),
    source: v.union(v.literal("manual"), v.literal("auto")),
    createdAt: v.number(),
    updatedAt: v.number(),
    postedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_created", ["userId", "createdAt"]),

  // Per-user automation + publishing settings.
  settings: defineTable({
    userId: v.id("users"),
    autoPost: v.boolean(),
    intervalMinutes: v.number(),
    privacyStatus: v.union(
      v.literal("public"),
      v.literal("unlisted"),
      v.literal("private"),
    ),
    aspectRatio: v.string(),
    durationSeconds: v.number(),
    titleTemplate: v.string(),
    descriptionTemplate: v.string(),
    lastPostedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_autoPost", ["autoPost"]),
});
