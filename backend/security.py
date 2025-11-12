import asyncio
import hmac
import os
import time
from collections import deque
from hashlib import sha256
from typing import Deque, Tuple

# настройки подписи
class signaturesettings:
    def __init__(self) -> None:
        self.secret = os.getenv("HMAC_SECRET", "telemetry-hmac-secret").encode()
        self.drift_seconds = int(os.getenv("HMAC_DRIFT", "30"))
        self.store_seconds = int(os.getenv("HMAC_REPLAY_TTL", "120"))

# защита от повторов
class replaystore:
    def __init__(self, retention: int) -> None:
        self.retention = retention
        self.entries: Deque[Tuple[int, bytes]] = deque()
        self.lock = asyncio.Lock()

    async def record(self, timestamp: int, signature: bytes) -> bool:
        async with self.lock:
            now = int(time.time())
            while self.entries and now - self.entries[0][0] > self.retention:
                self.entries.popleft()
            for _, existing in self.entries:
                if hmac.compare_digest(existing, signature):
                    return False
            self.entries.append((timestamp, signature))
            return True

# основной валидатор
class signaturevalidator:
    def __init__(self, settings: signaturesettings | None = None) -> None:
        self.settings = settings or signaturesettings()
        self.replays = replaystore(self.settings.store_seconds)

    def build_signature(self, timestamp: str, body: bytes) -> bytes:
        message = timestamp.encode() + b"." + body
        return hmac.new(self.settings.secret, message, sha256).digest()

    def validate_timestamp(self, timestamp: str) -> int:
        try:
            ts_value = int(timestamp)
        except ValueError as exc:
            raise ValueError("invalid timestamp") from exc
        now = int(time.time())
        if abs(now - ts_value) > self.settings.drift_seconds:
            raise ValueError("timestamp drift too large")
        return ts_value

    async def validate(self, timestamp: str, signature_hex: str, body: bytes) -> None:
        ts_value = self.validate_timestamp(timestamp)
        try:
            provided = bytes.fromhex(signature_hex)
        except ValueError as exc:
            raise ValueError("invalid signature encoding") from exc
        expected = self.build_signature(timestamp, body)
        if not hmac.compare_digest(expected, provided):
            raise ValueError("signature mismatch")
        replay_ok = await self.replays.record(ts_value, provided)
        if not replay_ok:
            raise ValueError("replayed signature")

