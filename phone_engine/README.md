# PocketPilot phone demo engine

This is a **guest-demo-only** bridge for the already installed BinaryOptionsToolsV2 library.

## Safety properties

- Uses `PocketOptionAsync.try_demo()` only.
- Does not ask for or read Pocket Option email, password, cookies, SSID, or account session.
- Verifies `is_demo()` before reporting a successful connection.
- Exposes only `/health`, `/connect`, `/status`, and `/disconnect`.
- Contains no buy, sell, trade, or order endpoint.
- Always reports `orders_enabled: false`.
- Bind Uvicorn to `127.0.0.1`; do not expose it directly to the public internet.

The guest demo session is separate from your personal Pocket Option demo account. Its displayed balance may be a simulated guest balance, not your account balance.

## Install on the existing Termux Debian environment

From the existing project directory, copy this folder into your local engine project, then use the same Python environment that has BinaryOptionsToolsV2 0.2.18 installed:

```bash
cd ~/pocketpilot-engine
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" python-dotenv
```

Create a local `.env` file with a random token (do not send it to ChatGPT or commit it):

```bash
python -c "import secrets; print(secrets.token_urlsafe(40))"
```

Save the printed value as `ENGINE_API_TOKEN=...` in `~/pocketpilot-engine/.env`.

Copy `phone_engine/app.py` from this repository to `~/pocketpilot-engine/app.py`, then start:

```bash
cd ~/pocketpilot-engine
source .venv/bin/activate
uvicorn app:app --host 127.0.0.1 --port 8788
```

Test local health:

```bash
curl http://127.0.0.1:8788/health
```

The health endpoint is intentionally public only on loopback and reveals no account information. Authenticated engine routes require the `X-Engine-Token` header.

## Cloudflare Worker connection

The existing Telegram Worker expects the engine routes `POST /connect`, `GET /status`, and `POST /disconnect`. Configure its `PHONE_ENGINE_URL` to the private tunnel URL and set `ENGINE_API_TOKEN` to the same local token using Cloudflare secrets. Do not use a temporary public tunnel for unattended production operation.

## Important

This bridge is for connectivity testing only. BinaryOptionsToolsV2 is a third-party, unofficial integration. A successful guest demo connection does not authenticate your personal account and does not establish authorization for live trading.
