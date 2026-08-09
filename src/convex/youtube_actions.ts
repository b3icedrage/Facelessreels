import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { downloadVideo } from "./veo";
import { applyDescriptionTemplate, applyTitleTemplate } from "./pipeline";
import { Id } from "./_generated/dataModel";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const clientId = () => process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || "";

const uid = (identity: { subject: string }) => identity.subject as Id<"users">;

function makeState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getYoutubeStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const account = await ctx.db
      .query("youtubeAccounts")
      .withIndex("by_user", (q) => q.eq("userId", uid(identity)))
      .first();
    if (!account) return null;
    return {
      channelId: account.channelId,
      channelTitle: account.channelTitle,
      channelThumbnail: account.channelThumbnail,
      connectedAt: account.connectedAt,
    };
  },
});

export const getAccountByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("youtubeAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getSettingsByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getOauthState = query({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!row || row.userId !== identity.subject) return null;
    return row;
  },
});

export const deleteOauthState = mutation({
  args: { stateId: v.id("oauthStates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.stateId);
  },
});

export const updateAccessToken = mutation({
  args: {
    accountId: v.id("youtubeAccounts"),
    accessToken: v.string(),
    expiresIn: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      accessToken: args.accessToken,
      tokenExpiresAt: Date.now() + args.expiresIn * 1000,
    });
  },
});

export const touchLastPosted = mutation({
  args: { settingsId: v.id("settings"), at: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.settingsId, { lastPostedAt: args.at });
  },
});

export const markIdeaPosted = mutation({
  args: { ideaId: v.id("contentIdeas"), at: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ideaId, { status: "posted", usedAt: args.at });
  },
});

/** Build the Google OAuth consent URL for connecting a YouTube channel. */
export const getYoutubeAuthUrl = action({
  args: { redirectUri: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const state = makeState();
    await ctx.runMutation(api.youtube_actions.saveOauthState, {
      state,
      redirectUri: args.redirectUri,
    });

    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: args.redirectUri,
      response_type: "code",
      scope: YOUTUBE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
      include_granted_scopes: "true",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
});

export const saveOauthState = mutation({
  args: { state: v.string(), redirectUri: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await ctx.db.insert("oauthStates", {
      state: args.state,
      redirectUri: args.redirectUri,
      userId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const exchangeCode = action({
  args: { code: v.string(), state: v.string(), redirectUri: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const stateRow = await ctx.runQuery(api.youtube_actions.getOauthState, {
      state: args.state,
    });
    if (!stateRow) throw new Error("Invalid OAuth state");
    if (stateRow.redirectUri !== args.redirectUri) {
      throw new Error("Redirect URI mismatch");
    }
    await ctx.runMutation(api.youtube_actions.deleteOauthState, {
      stateId: stateRow._id,
    });

    const body = new URLSearchParams({
      code: args.code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenBody = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      throw new Error(
        tokenBody?.error_description || tokenBody?.error || "OAuth token exchange failed",
      );
    }
    const accessToken: string = tokenBody.access_token;
    const refreshToken: string | undefined = tokenBody.refresh_token;
    const expiresIn: number = tokenBody.expires_in ?? 3600;
    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Re-connect and grant consent.");
    }

    const channelRes = await fetch(
      `${YOUTUBE_API}/channels?part=snippet,id&mine=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const channelBody = await channelRes.json().catch(() => null);
    if (!channelRes.ok) {
      throw new Error(channelBody?.error?.message || "Failed to fetch channel info");
    }
    const channel = channelBody?.items?.[0];
    if (!channel) throw new Error("No YouTube channel found for this account");

    await ctx.runMutation(api.youtube_actions.saveAccount, {
      userId: uid(identity),
      channelId: channel.id,
      channelTitle: channel.snippet?.title || "My Channel",
      channelThumbnail: channel.snippet?.thumbnails?.default?.url,
      accessToken,
      refreshToken,
      expiresIn,
    });

    return {
      channelId: channel.id,
      channelTitle: channel.snippet?.title || "My Channel",
    };
  },
});

export const saveAccount = mutation({
  args: {
    userId: v.id("users"),
    channelId: v.string(),
    channelTitle: v.string(),
    channelThumbnail: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("youtubeAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const data = {
      userId: args.userId,
      channelId: args.channelId,
      channelTitle: args.channelTitle,
      channelThumbnail: args.channelThumbnail,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: Date.now() + args.expiresIn * 1000,
      connectedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.replace(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("youtubeAccounts", data);
  },
});

export const disconnectYoutube = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("youtubeAccounts")
      .withIndex("by_user", (q) => q.eq("userId", uid(identity)))
      .first();
    if (account) await ctx.db.delete(account._id);
  },
});

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || "Token refresh failed");
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

/** Upload a rendered reel to YouTube and mark it posted. */
export const uploadReel = action({
  args: { reelId: v.id("reels") },
  handler: async (ctx, args) => {
    const reel = await ctx.runQuery(api.reels.getReelInternal, {
      reelId: args.reelId,
    });
    if (!reel) return;
    if (!reel.videoUri) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "Reel has no rendered video to upload.",
      });
      return;
    }

    const account = await ctx.runQuery(api.youtube_actions.getAccountByUserId, {
      userId: reel.userId,
    });
    if (!account) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "No YouTube account connected.",
      });
      return;
    }

    const settings = await ctx.runQuery(api.youtube_actions.getSettingsByUserId, {
      userId: reel.userId,
    });

    // Refresh the token if it's close to expiring.
    let accessToken = account.accessToken;
    if (Date.now() > account.tokenExpiresAt - 60_000) {
      const refreshed = await refreshAccessToken(account.refreshToken);
      accessToken = refreshed.accessToken;
      await ctx.runMutation(api.youtube_actions.updateAccessToken, {
        accountId: account._id,
        accessToken,
        expiresIn: refreshed.expiresIn,
      });
    }

    await ctx.runMutation(api.reels.setStatus, {
      reelId: args.reelId,
      status: "uploading",
    });

    // Download the video bytes.
    let bytes: ArrayBuffer;
    try {
      bytes = await downloadVideo(reel.videoUri);
    } catch (e: any) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: e?.message || "Failed downloading generated video.",
      });
      return;
    }

    const title = reel.title || applyTitleTemplate(
      settings?.titleTemplate || "",
      reel.prompt,
      reel.prompt.slice(0, 60),
    );
    const description = reel.description || applyDescriptionTemplate(
      settings?.descriptionTemplate || "",
      reel.prompt,
      title,
    );
    const privacyStatus = settings?.privacyStatus || "private";

    const uploadBody = Buffer.from(bytes);
    const metadata = JSON.stringify({
      snippet: {
        title,
        description,
        categoryId: "22",
        tags: ["AI video", "faceless", "shorts"],
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    });

    // Step 1: start a resumable session.
    const initRes = await fetch(
      `${YOUTUBE_API}/videos?part=snippet,status&uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(uploadBody.byteLength),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: metadata,
      },
    );
    if (!initRes.ok) {
      const errBody = await initRes.json().catch(() => null);
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: errBody?.error?.message || `Upload init failed (${initRes.status})`,
      });
      return;
    }
    const location = initRes.headers.get("location");
    if (!location) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "Upload session had no location header.",
      });
      return;
    }

    // Step 2: PUT the bytes.
    const uploadRes = await fetch(location, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Length": String(uploadBody.byteLength),
      },
      body: uploadBody,
    });
    const uploadBodyJson = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: uploadBodyJson?.error?.message || `Upload failed (${uploadRes.status})`,
      });
      return;
    }

    const videoId: string | undefined = uploadBodyJson?.id;
    if (!videoId) {
      await ctx.runMutation(api.reels.markFailed, {
        reelId: args.reelId,
        error: "Upload succeeded but returned no video id.",
      });
      return;
    }

    const now = Date.now();
    await ctx.runMutation(api.reels.markPosted, {
      reelId: args.reelId,
      youtubeVideoId: videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      postedAt: now,
    });

    if (settings) {
      await ctx.runMutation(api.youtube_actions.touchLastPosted, {
        settingsId: settings._id,
        at: now,
      });
    }
    if (reel.sourceIdeaId) {
      await ctx.runMutation(api.youtube_actions.markIdeaPosted, {
        ideaId: reel.sourceIdeaId,
        at: now,
      });
    }
  },
});
