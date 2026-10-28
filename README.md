# FacelessReels AI

A local-first faceless-reel draft generator plus a profit-gated worker lifecycle manager. Offline templates remain available without an API key.

## Faceless reel generation

Requires Python 3.11+ and the standard library. Create a draft pack with six timed scenes, narration, SRT captions, visual prompts, and JSON metadata:

```sh
python -m facelessreels.reels generate --topic "3 ways to improve study habits"
python -m facelessreels.reels generate --topic "Budget cooking for students" --style listicle --duration 30 --out output/budget-cooking
python -m facelessreels.reels generate --topic "A simple productivity lesson" --style story --duration 45
```

Styles: `educational`, `story`, `listicle`. Duration is 15–60 seconds. The output folder must not already exist; this prevents accidental overwrites.

Each output folder contains `script.txt`, `voiceover.txt` (the narration text), `captions.srt`, `visual_prompts.txt`, and `reel.json`.

Optional: render a simple vertical 1080×1920 caption-card MP4 using a locally installed FFmpeg:

```sh
python -m facelessreels.reels generate --topic "3 study tips" --render
```

This uses local FFmpeg only. It does not download tools, use stock footage, synthesize a voice, call external AI services, spend money, or publish to social platforms. This is a simple text-card video, not cinematic footage.

## Optional spoken voiceover

To create a spoken narration track and a second MP4 with audio, install the optional speech dependency. This speech step needs an internet connection and sends the narration text to the Edge TTS service; no API key is required. Review the provider's terms and privacy implications before using sensitive text.

```sh
python -m pip install -e '.[voiceover]'
python -m facelessreels.reels generate --topic "3 study tips" --style educational --duration 30 --render
python -m facelessreels.voiceover --input output/3-study-tips
```

The voiceover command creates `voiceover.mp3` and `reel_with_voiceover.mp4`. The video retains the existing scene-card text; `captions.srt` is provided as a separate subtitle file. This first version does not add stock footage, animated images, word-by-word subtitles, or automatic publishing. If the narration cannot fit reasonably within the rendered duration, shorten the script or choose a longer video.

You can choose another voice supported by Edge TTS, for example:

```sh
python -m facelessreels.voiceover --input output/3-study-tips --voice en-US-GuyNeural
```

Use a new output folder for every generation. The voiceover command writes only inside the selected existing output folder and never publishes the result.

## Real AI script generation with Google Gemini (explicit opt-in)

Google Gemini is the default provider. Create an API key in [Google AI Studio](https://aistudio.google.com/) and set it locally in Termux. Free usage is subject to Google's model availability, quota limits, account eligibility, and terms; neither a free tier nor an API key is guaranteed to last forever.

```sh
export GEMINI_API_KEY='your-gemini-api-key'
python -m facelessreels.reels generate --ai --topic "3 ways to improve study habits" --style educational --duration 30 --render
```

The default model is `gemini-3.6-flash`. The Gemini REST API uses the `x-goog-api-key` header and a model-specific `generateContent` endpoint. See Google's [API reference](https://ai.google.dev/api/) and [pricing/free-tier details](https://ai.google.dev/gemini-api/docs/pricing). AI generation and speech synthesis are separate opt-in steps: run the voiceover command after rendering if you want spoken narration.

NVIDIA NIM remains available as a fallback:

```sh
export NVIDIA_API_KEY='your-nvidia-api-key'
python -m facelessreels.reels generate --ai --provider nvidia --model stg/nvidia/nemotron-3.5-bolt-e4b --topic "Study habits that work"
```

An OpenAI-compatible alternative is also supported:

```sh
export OPENAI_API_KEY='your-openai-api-key'
python -m facelessreels.reels generate --ai --provider openai --model gpt-4o-mini --topic "Study habits that work"
```

Use `FACELESSREELS_AI_PROVIDER`, `FACELESSREELS_AI_MODEL`, and optionally `FACELESSREELS_AI_BASE_URL` to configure defaults. The API is called only when you explicitly pass `--ai`; costs depend on the selected provider, model, account, and endpoint. Review factual claims and rights before publishing.

## Safety defaults

- Offline templates by default; no API keys required for template scripts or silent MP4 rendering.
- Voiceover is optional and sends narration text to a third-party speech service only when explicitly requested.
- No automatic paid actions, purchases, cloud rendering, or publishing.
- Output folder must be new; the generator never overwrites an existing folder.
- Generated content is a draft and must be reviewed by a human.
- Profit-gated worker manager: $5 target net per rolling 24-hour UTC window; maximum 3 worker configuration records and 2 generations.
- Worker copies are configuration records, not executable self-replication. Evaluations are manual.
- SQLite data defaults to `data/facelessreels.sqlite3`.

## Setup and tests

```sh
python -m venv .venv
. .venv/bin/activate
python -m unittest discover -s tests -v
python -m facelessreels.agent init
python -m facelessreels.agent status
python -m facelessreels.reels --help
python -m facelessreels.voiceover --help
```

## Profit ledger

Set a strong secret in the runtime environment (do not commit it):

```sh
export FACELESSREELS_REVENUE_HMAC_KEY='replace-with-a-long-random-secret'
```

`.env.example` documents configuration; it is not automatically loaded.

Record a cost with a unique reference:

```sh
python -m facelessreels.agent cost --amount 1.25 --source video-render --source-ref render-001
```

Revenue JSON requires `kind`=`income`, `source`, unique `source_ref`, positive `amount`, `currency`=`USD`, optional timezone-aware ISO `timestamp`, and `signature`. Signature is lowercase hex HMAC-SHA256 of canonical JSON of all fields except signature (sorted keys, separators `,` and `:`). Only a trusted backend should sign an event after independently verifying completed provider settlement. Do not sign views, likes, estimates, pending payouts, or self-reported amounts. No payment-provider adapter is included.

```sh
python -m facelessreels.agent revenue --event-file revenue-event.json
python -m facelessreels.agent evaluate
python -m facelessreels.agent status
```

Net is verified revenue minus recorded costs. Net >= $5 records one bounded child configuration if limits permit; net below target stops active worker records.

## Before production

Add a provider-specific settlement verifier, protect and rotate secrets, add authentication before exposing any API, back up the database, and review platform rules and actual operating costs. Passing tests cannot guarantee profit.
