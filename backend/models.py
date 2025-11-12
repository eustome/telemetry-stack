from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class telemetricevent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1)
    cpu: Optional[float] = None
    mem_free: Optional[int] = None
    pid: Optional[int] = None
    name: Optional[str] = None
    rss: Optional[int] = None

    @field_validator("type")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        return value.lower()


class ingestbatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(min_length=1)
    ts: datetime
    platform: str = Field(min_length=1)
    events: list[telemetricevent]

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, value: str) -> str:
        return value.lower()

    @field_validator("events")
    @classmethod
    def ensure_events(cls, value: list[telemetricevent]) -> list[telemetricevent]:
        if not value:
            raise ValueError("events must not be empty")
        return value


class eventrecord(BaseModel):
    id: int
    agent_id: str
    ts: datetime
    platform: str
    event_type: str
    cpu: Optional[float] = None
    mem_free: Optional[int] = None
    pid: Optional[int] = None
    proc_name: Optional[str] = None
    rss: Optional[int] = None
    ingested_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "eventrecord":
        payload = dict(row)
        payload["ts"] = datetime.fromisoformat(payload["ts"])
        payload["ingested_at"] = datetime.fromisoformat(payload["ingested_at"])
        return cls(**payload)


class clearequest(BaseModel):
    agent_id: Optional[str] = None

