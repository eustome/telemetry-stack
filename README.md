# telemetry pipeline 
windows agent which collects telemetry data(basic sys metrics e.g cpu% and memory usage) sends it to FastApi backend, which persist events to SQLite and publishes it on react dashboard on localhost
C# agent -> python FastApi -> sqlite -> react dashboard. HMAC validation + disk queue + docker compose + start.bat
## stack
agent: .net 4.72 console app (eu/ConsoleApp2)
back: FastAPI + SQLite + websocket broadcast (backend)
front: react + TS + vite (frontend)

### fast launch

lanunch start.bat to automaticly install requirements and launch both: frontend and backend


### backend
manual start: 

python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

env options:
API_TOKEN (current token)
HMAC_SECRET (current hmac-secret)
HMAC_DRIFT (current 30s allowed (diff from req timestamp and backend time))
HMAC_REPLAY_TTL (caching HMAC (currently 120s))
DB_PATH (opt custom sqlite path)

### frontend
manual start :
cd frontend
npm install
npm run dev

link in VITE_API_BASE_URL
(default http://localhost:8000).
To use funcs that require authentification (clear) u need to provide token VITE_API_TOKEN (token)

### Windows Agent
build eu/ConsoleApp2.sln

run .exe, override if u want:
API_URL (http://localhost:8000)
API_TOKEN (token)
HMAC_SECRET (hmac-secret)
AGENT_ID (system user name)
INTERVAL_SECONDS (default 5, tick interval)
QUEUE_PATH (path where agent saves failure batchs)

agent signs requests with HMAC, fails are queued on disk and retried on next tick

### docker
docker compose up --build

backend at http://localhost:8000
frontend baked and served from Nginx at http://localhost:1337
sqlite stored inside at backend-data

## api

### post /api/ingest
POST /api/ingest
X-Api-Token: token
X-Signature-Ts: 1731415200
X-Signature: a51bd1...
Content-Type: application/json

{
  "agent_id": "host-01",
  "ts": "2025-11-12T12:00:00+00:00",
  "platform": "windows",
  "events": [
    {"type": "metric", "cpu": 0.32, "mem_free": 134217728},
    {"type": "proc", "pid": 1234, "name": "example.exe", "cpu": 0.08, "rss": 67108864}
  ]
}

resp: {"stored": 2}

### get /api/events
query params: agent_id, limit (def 50, max 500). returns newest first

### post /api/events/clear
POST /api/events/clear
X-Api-Token: token
Content-Type: application/json

{ "agent_id": "host-01" } // optional; omit to clear everything

resp: {"cleared": 128}

### websocket /ws
all events: ws://host/ws
single agent: ws://host/ws?agent_id=host-01

payload matches rows returned from GET /api/events

## stresstest
.venv\Scripts\activate
python tools/load_emitter.py --rate 150

hmac load bursts

## layout
backend/      fastapi app and sqlite db
pytest        test
frontend/     front(react)
eu/ConsoleApp2/     windows agent
tools/load_emitter.py     stress test
docker-compose.yml    docker
launch.bat      fast launch
README.md

