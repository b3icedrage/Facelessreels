# PocketPilot175Bot

Source repository for the Telegram bot **@PocketPilot175Bot**.

This repository replaces the former FacelessReels application source in this Git repository. The previous Git history remains available in earlier commits. The deployed Cloudflare Worker and its D1 database are separate resources and are not modified by a Git commit.

## What is included

- `worker.js` — the Telegram webhook Worker and command handlers.
- `db/schema.sql` — the D1 schema for bot state, owner UID format records, paper positions, paper trades, and signal state.
- `docs/ARCHITECTURE.md` — deployment layout and operating notes.

## Safety model

- **Paper trading only.** `/mode real` remains locked.
- No live broker orders are sent by this bot.
- Pocket Option UID linking checks only the format (8 or 9 digits); it does not verify account ownership.
- Never send broker passwords, browser cookies, session IDs, or API secrets to Telegram or commit them to Git.
- The optional phone-engine endpoints are not proof of an authenticated Pocket Option connection. Keep any engine in demo-only mode.
- Market candles come from the independent `biquote.io` feed; they are not guaranteed to match Pocket Option quotes.

## Cloudflare resources

The deployed Worker is named `pocketpilot175bot`. Its D1 binding is named `DB` and points to the existing database `pocketpilot175bot-db`.

Required Worker secrets:

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `OWNER_TELEGRAM_ID` | Telegram numeric owner ID |
| `WEBHOOK_SECRET` | Telegram webhook secret token |

Optional phone-engine integration:

| Setting | Type | Purpose |
|---|---|---|
| `PHONE_ENGINE_URL` | Worker variable | Base URL of a reachable phone-engine API |
| `ENGINE_API_TOKEN` | Worker secret | Shared token sent in `X-Engine-Token` |

Do not put real values in this repository. Configure them in Cloudflare Worker settings.

## Deploying the Worker

1. Open Cloudflare Dashboard → Workers & Pages → `pocketpilot175bot`.
2. Back up the current Worker version before replacing its code.
3. Upload the contents of `worker.js` as the Worker module.
4. Confirm the D1 binding is named `DB` and still points to `pocketpilot175bot-db`.
5. Confirm the three required secrets above are configured.
6. If using the optional engine integration, set `PHONE_ENGINE_URL` as a Worker variable and `ENGINE_API_TOKEN` as a secret. Otherwise leave the engine integration unused.
7. Confirm the Cron Trigger is `* * * * *` if you want the scheduled one-minute paper scan.
8. Confirm the Telegram webhook points to `https://YOUR-WORKER-DOMAIN/telegram-webhook` and uses the same `WEBHOOK_SECRET` value.

The GitHub source commit does **not** deploy or change the running Worker automatically.

## D1 schema

For a new database, apply `db/schema.sql`. It uses `CREATE TABLE IF NOT EXISTS` and does not delete data. On the existing production database, do not reset or recreate the database: its historical trades and current state should be preserved.

The production database also contains a legacy archival table named `paper_positions_legacy_20261124`. It is intentionally not recreated by this clean schema because the current Worker does not use it.

## Telegram commands

- `/start`, `/help`
- `/status`
- `/scan`
- `/signals`
- `/mode demo` — paper mode
- `/mode real` — locked
- `/pause`, `/resume`
- `/stats`, `/history`, `/audit`
- `/uid 12345678`, `/myuid` — format-only UID record
- `/paperwin`, `/paperloss` — simulated outcomes
- `/engine connect`, `/engine status`, `/engine disconnect` — optional engine status integration

All commands are restricted to the configured owner Telegram ID.
