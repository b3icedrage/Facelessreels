"""PocketPilot demo-only Pocket Option bridge.

This bridge uses BinaryOptionsToolsV2's guest try_demo() session.
It never accepts credentials/SSIDs and deliberately exposes no order endpoint.
Bind to 127.0.0.1; expose it only through an authenticated private tunnel.
"""
import asyncio
import hmac
import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from BinaryOptionsToolsV2 import PocketOptionAsync

load_dotenv()

ENGINE_API_TOKEN = os.getenv("ENGINE_API_TOKEN", "")
_client: Optional[PocketOptionAsync] = None
_lock = asyncio.Lock()


def require_token(value: Optional[str]) -> None:
    if not ENGINE_API_TOKEN:
        raise HTTPException(status_code=503, detail="ENGINE_API_TOKEN is not configured")
    if not value or not hmac.compare_digest(value, ENGINE_API_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


def connection_status():
    if _client is None:
        return {
            "ok": True,
            "connected": False,
            "account_mode": "demo",
            "balance": None,
            "orders_enabled": False,
            "message": "No guest demo session is connected",
        }
    connected = bool(_client.is_connected())
    is_demo = bool(_client.is_demo())
    if not is_demo:
        connected = False
    return {
        "ok": True,
        "connected": connected,
        "account_mode": "demo" if is_demo else "blocked",
        "balance": None,
        "orders_enabled": False,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    global _client
    if _client is not None:
        try:
            await _client.shutdown()
        except Exception:
            pass
        _client = None


app = FastAPI(
    title="PocketPilot Demo Engine",
    version="1.0.0",
    description="Guest-demo connection only. No credentials and no order endpoints.",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "PocketPilot Demo Engine",
        "mode": "guest_demo_only",
        "orders_enabled": False,
    }


@app.post("/connect")
async def connect(x_engine_token: Optional[str] = Header(default=None)):
    require_token(x_engine_token)
    global _client
    async with _lock:
        if _client is not None:
            try:
                if _client.is_connected() and _client.is_demo():
                    balance = await _client.balance()
                    return {
                        "ok": True,
                        "connected": True,
                        "account_mode": "demo",
                        "balance": float(balance) if balance is not None and float(balance) >= 0 else None,
                        "orders_enabled": False,
                        "message": "Existing guest demo session reused",
                    }
            except Exception:
                try:
                    await _client.shutdown()
                except Exception:
                    pass
                _client = None

        try:
            # Guest "try demo" session: no Pocket Option login, cookie or SSID.
            candidate = await PocketOptionAsync.try_demo()
            await asyncio.sleep(1)
            if not candidate.is_connected() or not candidate.is_demo():
                await candidate.shutdown()
                raise RuntimeError("Guest session did not confirm a demo connection")
            _client = candidate
            balance = await candidate.balance()
            return {
                "ok": True,
                "connected": True,
                "account_mode": "demo",
                "balance": float(balance) if balance is not None and float(balance) >= 0 else None,
                "orders_enabled": False,
                "message": "Pocket Option guest demo connected; no orders can be placed through this bridge",
            }
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Demo connection failed: " + str(exc)[:180])


@app.get("/status")
async def status(x_engine_token: Optional[str] = Header(default=None)):
    require_token(x_engine_token)
    if _client is None:
        return connection_status()
    try:
        result = connection_status()
        if result["connected"]:
            balance = await _client.balance()
            result["balance"] = float(balance) if balance is not None and float(balance) >= 0 else None
        return result
    except Exception:
        return {
            "ok": True,
            "connected": False,
            "account_mode": "demo",
            "balance": None,
            "orders_enabled": False,
            "message": "Demo session is not currently responsive",
        }


@app.post("/disconnect")
async def disconnect(x_engine_token: Optional[str] = Header(default=None)):
    require_token(x_engine_token)
    global _client
    async with _lock:
        if _client is not None:
            try:
                await _client.shutdown()
            finally:
                _client = None
    return {
        "ok": True,
        "connected": False,
        "account_mode": "demo",
        "orders_enabled": False,
        "message": "Guest demo session disconnected",
    }
