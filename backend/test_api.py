from datetime import datetime, timezone
import json
import os
import time
import pytest
from httpx import AsyncClient
from . import main as backend_main
from .database import fetch_events, init_db
from .main import app
from .security import signaturevalidator


@pytest.fixture(autouse=True)
def override_db(tmp_path, monkeypatch):
    db_path = tmp_path / "telemetry.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("API_TOKEN", "token")
    return db_path


@pytest.mark.asyncio
async def test_ingest_and_fetch(monkeypatch):
    secret = "unit-secret"
    monkeypatch.setenv("HMAC_SECRET", secret)
    backend_main.validator.settings.secret = secret.encode()
    await init_db()
    async with AsyncClient(app=app, base_url="http://test") as client:
        payload = {
            "agent_id": "agent-test",
            "ts": datetime.now(timezone.utc).isoformat(),
            "platform": "windows",
            "events": [
            {"type": "metric", "cpu": 0.25, "mem_free": 123456789},
            {"type": "proc", "pid": 1000, "name": "demo", "cpu": 0.12, "rss": 2048},
            ],
        }
        body = json.dumps(payload, separators=(",", ":"))
        timestamp = str(int(time.time()))
        validator = signaturevalidator()
        validator.settings.secret = secret.encode()
        signature = validator.build_signature(timestamp, body.encode()).hex()
        response = await client.post(
            "/api/ingest",
            content=body,
            headers={
                "X-Api-Token": "token",
                "Content-Type": "application/json",
                "X-Signature": signature,
                "X-Signature-Ts": timestamp,
            },
        )
        assert response.status_code == 200
        assert response.json()["stored"] == 2

    records = await fetch_events("agent-test", 10)
    assert len(records) == 2
    types = sorted(record["event_type"] for record in records)
    assert types == ["metric", "proc"]


@pytest.mark.asyncio
async def test_ingest_bad_signature(monkeypatch):
    secret = "unit-secret"
    monkeypatch.setenv("HMAC_SECRET", secret)
    backend_main.validator.settings.secret = secret.encode()
    await init_db()
    async with AsyncClient(app=app, base_url="http://test") as client:
        payload = {
            "agent_id": "agent-test",
            "ts": datetime.now(timezone.utc).isoformat(),
            "platform": "windows",
            "events": [
            {"type": "metric", "cpu": 0.25, "mem_free": 123456789},
            ],
        }
        body = json.dumps(payload, separators=(",", ":"))
        timestamp = str(int(time.time()))
        response = await client.post(
            "/api/ingest",
            content=body,
            headers={
                "X-Api-Token": "token",
                "Content-Type": "application/json",
                "X-Signature": "deadbeef",
                "X-Signature-Ts": timestamp,
            },
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_clear_events(monkeypatch):
    secret = "unit-secret"
    monkeypatch.setenv("HMAC_SECRET", secret)
    await init_db()
    async with AsyncClient(app=app, base_url="http://test") as client:
        payload = {
            "agent_id": "agent-test",
            "ts": datetime.now(timezone.utc).isoformat(),
            "platform": "windows",
            "events": [
                {"type": "metric", "cpu": 0.25, "mem_free": 123456789},
            ],
        }
        body = json.dumps(payload, separators=(",", ":"))
        timestamp = str(int(time.time()))
        validator = signaturevalidator()
        validator.settings.secret = secret.encode()
        signature = validator.build_signature(timestamp, body.encode()).hex()
        await client.post(
            "/api/ingest",
            content=body,
            headers={
                "X-Api-Token": "token",
                "Content-Type": "application/json",
                "X-Signature": signature,
                "X-Signature-Ts": timestamp,
            },
        )

        response = await client.post(
            "/api/events/clear",
            json={"agent_id": "agent-test"},
            headers={"X-Api-Token": "token"},
        )
        assert response.status_code == 200
        assert response.json()["cleared"] == 1

    records = await fetch_events("agent-test", 10)
    assert records == []

