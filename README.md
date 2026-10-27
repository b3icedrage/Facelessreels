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

Each output folder contains `script.txt`, `voiceover.txt`, `captions.srt`, `visual_prompts.txt`, and `reel.json`.

Optional: render a simple vertical 1080×1920 caption-card MP4 using a locally installed FFmpeg:

```sh
python -m facelessreels.reels generate --topic "3 study tips" --render
```

This uses local FFmpeg only. It does not download tools, use stock footage, synthesize a voice, call external AI services, spend money, or publish to social platforms. This is a simple text-card video, not cinematic footage.

## Real AI script generation with NVIDIA NIM (explicit opt-in)

NVIDIA NIM is the default provider. Create a key through [NVIDIA Build](https://build.nvidia.com/) and set it in your local Termux shell. Never commit API keys to GitHub or paste them into chat:

```sh
export NVIDIA_API_KEY='your-nvidia-api-key'
python -m facelessreels.reels generate --ai --topic "3 ways to improve study habits" --style educational --duration 30
```

The default model is `stg/nvidia/nemotron-3.5-bolt-e4b`, NVIDIA's current compact text model listing. You can specify it explicitly:

```sh
python -m facelessreels.reels generate --ai --provider nvidia --model stg/nvidia/nemotron-3.5-bolt-e4b --topic "Study habits that work" --duration 30
```

NVIDIA's hosted NIM Chat Completions endpoint is `https://integrate.api.nvidia.com/v1/chat/completions`. See NVIDIA's [current model catalog](https://build.nvidia.com/models) and [Nemotron 3.5 Bolt API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-bolt-e4b-infer) for current access, quotas, pricing and terms. NVIDIA documents `stg/nvidia/nemotron-3.5-bolt-e4b` for standalone gateway requests; endpoint availability may change.

An OpenAI-compatible alternative is also supported:

```sh
export OPENAI_API_KEY='your-openai-api-key'
python -m facelessreels.reels generate --ai --provider openai --model gpt-4o-mini --topic "Study habits that work"
```

Use `FACELESSREELS_AI_PROVIDER`, `FACELESSREELS_AI_MODEL`, and optionally `FACELESSREELS_AI_BASE_URL` to configure defaults. The API is called only when you explicitly pass `--ai`; the request may incur charges depending on your endpoint and account. This feature writes AI-generated scripts, captions, scene prompts, and metadata. It does not generate footage or voice audio, publish anything, or trigger other paid services. Review factual claims and rights before publishing.

## Safety defaults

- Offline templates by default; no API keys required.
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
