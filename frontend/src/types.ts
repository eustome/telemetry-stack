export type eventrecord = {
  id: number;
  agent_id: string;
  ts: string;
  platform: string;
  event_type: string;
  cpu?: number;
  mem_free?: number;
  pid?: number;
  proc_name?: string;
  rss?: number;
  ingested_at: string;
  received_at?: number;
};

export type websocketstate = "idle" | "connecting" | "open" | "closed" | "error";

