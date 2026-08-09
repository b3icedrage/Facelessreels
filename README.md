# Faceless Reels 🎬

An AI video studio that turns one-line prompts into finished YouTube videos — generated
by Google Veo, titled, described, and published to your channel on autopilot.

## How it works

1. **Describe an idea** — drop a prompt into the queue (or generate one instantly).
2. **Veo renders it** — Google Veo 3.1 (via the Gemini API) turns the prompt into real
   footage in your chosen aspect ratio and duration.
3. **YouTube posts it** — the reel is uploaded with your title/description templates and
   privacy setting, on a schedule you control. Fully automatic.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn-style UI + Framer Motion
- **Backend**: Convex (database, auth, background actions, crons)
- **Auth**: Convex Auth (email + password)
- **AI video**: Google Veo via the Gemini API (`veo-3.1-generate-preview`)
- **Publishing**: YouTube Data API v3 (resumable upload + OAuth2 refresh tokens)

## Local development

```bash
bun install
bunx convex dev --once   # generates types + pushes functions to the local deployment
bun run dev              # Vite on http://localhost:5173
```

## Required environment variables

Set these in the **Freebuff API Keys** tab (they are read server-side by Convex actions):

| Variable | Where to get it | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Veo video generation |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth client | YouTube OAuth connect |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client | YouTube OAuth connect |

Optional: `VEO_MODEL` (defaults to `veo-3.1-generate-preview`).

## YouTube connection setup (one-time, ~10 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a project
   (or pick one).
2. **Enable APIs**: search for and enable **YouTube Data API v3**.
3. **OAuth consent screen**: configure it as *External*; add your email as a test user.
4. **Credentials → Create credentials → OAuth client ID** → Application type: *Web
   application*.
5. Add the **Authorized redirect URI**: `<your-app-origin>/youtube/callback`
   (for the preview: the Freebuff preview URL; for production: the deployed URL).
6. Copy the **Client ID** and **Client secret** into the `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` env vars.
7. In the app: **Connect YouTube** → approve the consent screen. Done.

> Tip: the app requests offline access, so it stores a refresh token and can keep posting
> without you re-authorizing. Privacy defaults to `private` — switch to `unlisted` or
> `public` when you're ready.

## The automatic pipeline

The `pipeline:runAutoPipeline` cron (every 3 minutes) walks every user with autopilot
enabled:

- has a connected YouTube account,
- has no job currently in flight,
- the posting interval has elapsed since the last post,
- and there's a queued idea —

and starts the next reel. Failed generations are re-queued and surfaced in the library
for one-click retry.
