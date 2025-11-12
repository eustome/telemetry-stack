import React, { useEffect, useMemo, useState } from "react";
import { eventstable } from "./components/eventstable";
import { statscard } from "./components/statscard";
import { dropdown } from "./components/dropdown";
import { usewebsocket } from "./hooks/usewebsocket";
import type { eventrecord } from "./types";

const api_base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
const api_token = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? "token";
const history_cap = 500;
const page_size_options = [25, 50, 100];

const normalize_event = (event: eventrecord): eventrecord => {
  const source = event.ingested_at ?? event.ts;
  const parsed = new Date(source).getTime();
  const received_at = Number.isFinite(parsed) ? parsed : Date.now();
  return { ...event, received_at };
};

const app = () => {
  const [history, set_history] = useState<eventrecord[]>([]);
  const [agent_filter, set_agent_filter] = useState<string>("");
  const [page, set_page] = useState<number>(1);
  const [page_size, set_page_size] = useState<number>(page_size_options[0]);

  const websocket_url = useMemo(() => {
    const origin = api_base.replace(/^https?:\/\//, "");
    const protocol = api_base.startsWith("https") ? "wss" : "ws";
    const query = agent_filter ? `?agent_id=${encodeURIComponent(agent_filter)}` : "";
    return `${protocol}://${origin}/ws${query}`;
  }, [agent_filter]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("limit", history_cap.toString());
    if (agent_filter) {
      params.set("agent_id", agent_filter);
    }

    const load = async () => {
      try {
        const response = await fetch(`${api_base}/api/events?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) {
          set_history([]);
          set_page(1);
          return;
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          const normalized = data.map((item) => normalize_event(item));
          set_history(normalized);
          set_page(1);
        } else {
          set_history([]);
          set_page(1);
        }
      } catch {
        set_history([]);
        set_page(1);
      }
    };

    load();

    return () => {
      controller.abort();
    };
  }, [agent_filter]);

  const connection = usewebsocket(websocket_url, {
    on_message: (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as eventrecord | { type: string; agent_id?: string };
        if ((payload as any).type === "clear") {
          set_history((current: eventrecord[]) =>
            (payload as any).agent_id
              ? current.filter((entry) => entry.agent_id !== (payload as any).agent_id)
              : []
          );
          return;
        }
        const telemetry = normalize_event(payload as eventrecord);
        set_history((current: eventrecord[]) => {
          const filtered = current.filter((item: eventrecord) => item.id !== telemetry.id);
          filtered.unshift(telemetry);
          if (filtered.length > history_cap) {
            filtered.length = history_cap;
          }
          return [...filtered];
        });
      } catch {
      }
    }
  });

  const filtered_events = useMemo(() => {
    if (!agent_filter) {
      return history;
    }
    return history.filter((item) => item.agent_id === agent_filter);
  }, [history, agent_filter]);

  useEffect(() => {
    const total_pages = Math.max(1, Math.ceil(filtered_events.length / page_size));
    if (page > total_pages) {
      set_page(total_pages);
    }
  }, [filtered_events, page, page_size]);

  const agents = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of history) {
      ids.add(entry.agent_id);
    }
    return Array.from(ids).sort((a: string, b: string) => a.localeCompare(b));
  }, [history]);

  const start = (page - 1) * page_size;
  const current_slice = filtered_events.slice(start, start + page_size);

  const handle_clear = async () => {
    try {
      await fetch(`${api_base}/api/events/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Token": api_token
        },
        body: JSON.stringify(agent_filter ? { agent_id: agent_filter } : {})
      });
    } catch {
    } finally {
      if (agent_filter) {
        set_history((current) =>
          current
            .filter((item) => item.agent_id !== agent_filter)
            .map((item) => normalize_event(item))
        );
      } else {
        set_history([]);
      }
      set_page(1);
    }
  };

  const handle_page_size = (size: number) => {
    set_page_size(size);
    set_page(1);
  };

  const hero = React.createElement(
    "div",
    { className: "space-y-4 rounded-3xl border border-slate-800/50 bg-gradient-to-br from-panel/90 via-surface to-surface/60 p-8 shadow-2xl" },
    React.createElement(
      "div",
      { className: "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" },
      React.createElement(
        "div",
        { className: "space-y-3" },
        React.createElement("h1", { className: "text-4xl font-semibold text-slate-50 tracking-tight" }, "Telemetry liveboard"),
        React.createElement(
          "p",
          { className: "text-sm uppercase tracking-[0.3em] text-slate-400" },
          "streamed edge metrics in real time"
        )
      ),
      React.createElement(
        "div",
        { className: "flex flex-col gap-3 sm:flex-row sm:items-end" },
        React.createElement(
          "label",
          { className: "flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-slate-400" },
          "agent filter",
          React.createElement(dropdown, {
            value: agent_filter,
            on_change: (value: string | number) => {
              set_agent_filter(value as string);
              set_page(1);
            },
            options: [
              { value: "", label: "all agents" },
              ...agents.map((agent) => ({ value: agent, label: agent }))
            ],
            button_class:
              "inline-flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-panel px-4 py-2 text-xs uppercase tracking-[0.25em] text-slate-100 transition hover:border-accent focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
            menu_class:
              "absolute top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-700 bg-panel/95 shadow-2xl backdrop-blur"
          })
        ),
        React.createElement(
          "button",
          {
            onClick: handle_clear,
            className: "inline-flex items-center justify-center rounded-xl border border-rose-500/60 bg-gradient-to-r from-rose-500/20 via-rose-500/10 to-transparent px-4 py-2 text-xs uppercase tracking-[0.25em] text-rose-200 transition hover:border-rose-400 hover:from-rose-500/30 hover:text-rose-50"
          },
          "clear log"
        )
      )
    ),
    React.createElement(statscard, { events: history, connection })
  );

  return React.createElement(
    "div",
    { className: "min-h-screen bg-gradient-to-br from-surface via-slate-950 to-slate-900 text-slate-50" },
    React.createElement(
      "div",
      { className: "mx-auto max-w-7xl space-y-8 px-4 py-12 md:px-10" },
      hero,
      React.createElement(eventstable, {
        events: current_slice,
        total: filtered_events.length,
        page,
        page_size,
        on_page_change: set_page,
        on_page_size_change: handle_page_size,
        page_size_options
      })
    )
  );
};

export default app;

