# FacelessReels AI

A local-first faceless-reel draft generator plus a profit-gated worker lifecycle manager. The generator works offline with built-in templates; it does not call a paid AI API or claim that generated drafts will earn money.

## Faceless reel generation

Requires Python 3.11+ and the standard library. Create a draft pack with a hook, six timed scenes, narration script, SRT captions, visual prompts, and JSON metadata:

```sh
python -m facelessreels.reels generate --topic "3 ways to improve study habits"
python -m facelessreels.reels generate --topic "Budget cooking for students" --style listicle --duration 30 --out output/budget-cooking
python -m facelessreels.reels generate --topic "A simple productivity lesson" --style story --duration 45
```

Styles: `educational`, `story`, `listicle`. Duration is 15–60 seconds. The output folder must not already exist; this prevents accidental overwrites.

Each generated folder contains:
- `script.txt` — scene-by-scene script
- `voiceover.txt` — combined narration ready for a voice recording or local text-to-speech tool
- `captions.srt` — timed subtitle file
- `visual_prompts.txt` — prompts for sourcing or generating background visuals
- `reel.json` — scene timing, text, prompts, and safety metadata

Optional: render a simple vertical 1080×1920 caption-card MP4 using a locally installed FFmpeg:

```sh
python -m facelessreels.reels generate --topic "3 study tips" --render
```

This uses local FFmpeg only. It does not download tools, use stock footage, synthesize a voice, call external AI services, spend money, or publish to social platforms. The MP4 option makes a simple text-card video, not a cinematic video with generated footage or narration. Review factual claims, copyright, and visuals before use.

## Real AI script generation (explicit opt-in)

The default remains offline templates. To request an original script from an OpenAI-compatible Chat Completions API, first set your API key in your local shell (never commit it):

```sh
export OPENAI_API_KEY='your-api-key'
python -m facelessreels.reels generate --ai --topic "3 ways to improve study habits" --style educational --duration 30
```

Choose a model explicitly if needed:

```sh
python -m facelessreels.reels generate --ai --model gpt-4o-mini --topic "Study habits that work" --duration 30
```

The AI request is made only when you explicitly pass `--ai`. API usage may incur charges according to your provider and account; check your provider's pricing and usage limits first. No key is required for offline mode. Set `FACELESSREELS_AI_MODEL` to change the default model, or `FACELESSREELS_AI_BASE_URL` to use a compatible endpoint. The provider must support Chat Completions and JSON-object response mode. Do not use an untrusted endpoint with a real API key.

AI creates a draft script, not a finished cinematic video. It does not create video footage or voice audio, publish anything, or automatically spend money beyond the API request you explicitly initiated. The optional local FFmpeg render remains a caption-card MP4. Review factual claims, visual rights, and generated text before publishing.

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
