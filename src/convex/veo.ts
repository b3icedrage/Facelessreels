import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const VEO_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const VEO_MODEL =
  process.env.VEO_MODEL || "veo-3.1-generate-preview";

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

export function geminiHeaders(extra?: Record<string, string>) {
  return {
    "x-goog-api-key": GEMINI_KEY() || "",
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function startVeoOperation(prompt: string, parameters: {
  aspectRatio: string;
  durationSeconds: number;
}) {
  const res = await fetch(
    `${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: geminiHeaders(),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: parameters.aspectRatio,
          durationSeconds: parameters.durationSeconds,
          numberOfVideos: 1,
        },
      }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      `Veo API error ${res.status}`;
    throw new Error(message);
  }
  const name: string | undefined = body?.name;
  if (!name) throw new Error("Veo API returned no operation name");
  return name;
}

export async function pollVeoOperation(name: string) {
  const res = await fetch(`${VEO_BASE}/${name}`, {
    method: "GET",
    headers: geminiHeaders(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body?.error?.message || body?.message || `Veo poll error ${res.status}`;
    throw new Error(message);
  }
  return body as Record<string, any>;
}

/**
 * Extract the generated video + thumbnail URIs from a completed Veo
 * operation response. The REST response nests samples a few different
 * ways depending on API version, so we search several known paths.
 */
export function extractVideoFromOperation(body: Record<string, any>): {
  videoUri?: string;
  thumbnailUri?: string;
} {
  const response = body?.response ?? {};
  // Modern Veo 3.x: response.videos[i].video.uri
  const videos = Array.isArray(response?.videos) ? response.videos : [];
  if (videos.length > 0) {
    const first = videos[0] ?? {};
    return {
      videoUri: first?.video?.uri || first?.video?.url,
      thumbnailUri: first?.videoThumbnail?.uri || first?.videoThumbnail?.url,
    };
  }
  // generateVideoResponse.generatedSamples
  const samples =
    response?.generateVideoResponse?.generatedSamples ||
    response?.generatedSamples ||
    [];
  if (samples.length > 0) {
    const first = samples[0] ?? {};
    return {
      videoUri: first?.video?.uri || first?.video?.url,
      thumbnailUri: first?.videoThumbnail?.uri || first?.videoThumbnail?.url,
    };
  }
  return {};
}

/** Download a generated video's bytes from its (signed) URI. */
export async function downloadVideo(uri: string): Promise<ArrayBuffer> {
  const url =
    uri.startsWith("gs://") || uri.startsWith("http")
      ? uri
      : `https://storage.googleapis.com/${uri}`;
  const res = await fetch(url, {
    headers: { "x-goog-api-key": GEMINI_KEY() || "" },
    redirect: "follow",
  });
  if (!res.ok) {
    // Some deployments issue plain GCS urls that need no key.
    const retry = await fetch(url);
    if (!retry.ok) {
      throw new Error(
        `Failed to download generated video (${res.status}) — the video may need to be fetched from a public storage URL.`,
      );
    }
    return retry.arrayBuffer();
  }
  return res.arrayBuffer();
}

export const startVeoGenerationAction = action({
  args: {
    prompt: v.string(),
    aspectRatio: v.string(),
    durationSeconds: v.number(),
    title: v.string(),
    description: v.string(),
    reelId: v.id("reels"),
  },
  handler: async (ctx, args) => {
    const operationName = await startVeoOperation(args.prompt, {
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
    });
    await ctx.runMutation(api.reels.setOperation, {
      reelId: args.reelId,
      operationName,
    });
    // Kick off the polling loop.
    await ctx.runAction(api.pipeline.pollReel, {
      reelId: args.reelId,
      attempt: 0,
    });
  },
});
