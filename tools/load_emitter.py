import argparse
import asyncio
import hmac
import json
import os
import random
import time
from datetime import datetime, timezone
from hashlib import sha256
import httpx


def build_signature(secret: bytes, timestamp: str, body: bytes) -> str:
    digest = hmac.new(secret, timestamp.encode() + b"." + body, sha256).hexdigest()
    return digest


def make_event(agent_id: str) -> dict:
    cpu = random.random()
    mem = random.randint(256, 16_384) * 1024 * 1024
    processes = [
        {"type": "proc", "pid": random.randint(200, 50_000), "name": f"proc-{i}", "cpu": random.random()}
        for i in range(3)
    ]
    events = [{"type": "metric", "cpu": cpu, "mem_free": mem}]
    events.extend(processes)
    return {
        "agent_id": agent_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "platform": "loadgen",
        "events": events,
    }


async def send_loop(url: str, token: str, secret: bytes, rate: int, batch: int, agent_prefix: str) -> None:
    interval = 1 / max(rate, 1)
    async with httpx.AsyncClient(timeout=5.0) as client:
        while True:
            payloads = []
            for _ in range(batch):
                agent_id = f"{agent_prefix}-{random.randint(1, 1000):04d}"
                payloads.append(make_event(agent_id))
            for payload in payloads:
                body = json.dumps(payload, separators=(",", ":")).encode()
                timestamp = str(int(time.time()))
                signature = build_signature(secret, timestamp, body)
                headers = {
                    "Content-Type": "application/json",
                    "X-Api-Token": token,
                    "X-Signature": signature,
                    "X-Signature-Ts": timestamp,
                }
                await client.post(url, content=body, headers=headers)
                await asyncio.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Telemetry load emitter")
    parser.add_argument("--url", default=os.getenv("API_URL", "http://localhost:8000/api/ingest"))
    parser.add_argument("--token", default=os.getenv("API_TOKEN", "telemetry-secret-token"))
    parser.add_argument("--secret", default=os.getenv("HMAC_SECRET", "telemetry-hmac-secret"))
    parser.add_argument("--rate", type=int, default=100, help="events per second")
    parser.add_argument("--batch", type=int, default=5, help="requests per loop")
    parser.add_argument("--agent-prefix", default="loadgen")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    await send_loop(args.url, args.token, args.secret.encode(), args.rate, args.batch, args.agent_prefix)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

