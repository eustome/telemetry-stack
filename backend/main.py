import asyncio
import os
from typing import Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .database import fetch_events, init_db, insert_events, remove_events
from .models import ingestbatch, eventrecord, clearequest
from .security import signaturevalidator

# конфигурация
api_token = os.getenv("API_TOKEN", "telemetry-secret-token")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# менеджер подключений
class connectionmanager:
    def __init__(self) -> None:
        self.connections: list[tuple[WebSocket, Optional[str]]] = []
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, agent_id: Optional[str]) -> None:
        await websocket.accept()
        async with self.lock:
            self.connections.append((websocket, agent_id))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            self.connections = [
                (candidate, agent)
                for candidate, agent in self.connections
                if candidate is not websocket
            ]

    async def broadcast(self, payload: dict) -> None:
        async with self.lock:
            targets = list(self.connections)
        for websocket, agent in targets:
            if agent and payload.get("agent_id") != agent:
                continue
            try:
                await websocket.send_json(payload)
            except Exception:
                await self.disconnect(websocket)


manager = connectionmanager()
validator = signaturevalidator()


async def require_token(x_api_token: str = Header(...)) -> None:
    if x_api_token != api_token:
        raise HTTPException(status_code=401, detail="invalid token")


# проверка подписи
async def require_signature(
    request: Request,
    x_signature_ts: str = Header(..., alias="X-Signature-Ts"),
    x_signature: str = Header(..., alias="X-Signature"),
) -> None:
    body = await request.body()
    try:
        await validator.validate(x_signature_ts, x_signature, body)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@app.on_event("startup")
async def startup() -> None:
    await init_db()


@app.post("/api/ingest")
async def ingest(
    batch: ingestbatch,
    _: None = Depends(require_token),
    __: None = Depends(require_signature),
) -> dict:
    ts_value = batch.ts.isoformat()
    rows = []
    for event in batch.events:
        rows.append(
            (
                batch.agent_id,
                ts_value,
                batch.platform,
                event.type,
                event.cpu,
                event.mem_free,
                event.pid,
                event.name,
                event.rss,
            )
        )
    inserted = await insert_events(rows)
    payloads = [eventrecord.from_row(row).model_dump(mode="json") for row in inserted]
    for payload in payloads:
        await manager.broadcast(payload)
    return {"stored": len(payloads)}


@app.get("/api/events")
async def events(
    agent_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict]:
    rows = await fetch_events(agent_id, limit)
    return [eventrecord.from_row(row).model_dump(mode="json") for row in rows]


# очистка базы
@app.post("/api/events/clear")
async def clear_events(
    body: clearequest,
    _: None = Depends(require_token),
) -> dict:
    removed = await remove_events(body.agent_id)
    await manager.broadcast(
        {
            "type": "clear",
            "agent_id": body.agent_id,
        }
    )
    return {"cleared": removed}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    agent_id = websocket.query_params.get("agent_id")
    await manager.connect(websocket, agent_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)

