# Architecture

```
Telegram user
    |
    v
Telegram Bot API webhook
    |
    v
Cloudflare Worker: pocketpilot175bot
    |                         |
    |                         +--> Independent candle feed (biquote.io)
    |
    +--> Cloudflare D1: pocketpilot175bot-db
    |
    +--> Optional phone engine API (demo-only status integration)
```

## Runtime responsibilities

- The Worker validates the Telegram webhook secret and owner Telegram ID.
- D1 stores paper balance, paper positions, closed simulated trades, UID format records, and last-scanned candle timestamps.
- The scheduled handler runs paper scans when the bot is in demo mode and not paused.
- The engine integration only calls the configured engine's connect/status/disconnect endpoints. It does not place broker orders.

## Risk and integrity controls

- Real-money mode is explicitly locked in the command handler.
- Each symbol has at most one open paper position.
- Candle timestamps are used to avoid repeatedly opening positions on the same bar.
- The daily paper-loss threshold blocks new simulated positions.
- Closing a paper position is guarded by a unique trade record and conditional update/delete logic to reduce duplicate accounting.
- UID checks are format-only and must not be described as account verification.

## Production data

The D1 database is an independent production resource. Never include a database export, user records, Telegram IDs, tokens, cookies, or broker sessions in Git.
