import React, { useMemo } from "react";
import type { eventrecord, websocketstate } from "../types";

type props = {
  events: eventrecord[];
  connection: websocketstate;
};

const stat_card = (title: string, value: string, subtitle?: string, accent?: string) =>
  React.createElement(
    "div",
    {
      className: `relative overflow-hidden rounded-3xl border border-slate-800/60 bg-gradient-to-br from-panel/85 via-panel/60 to-panel/40 p-5 shadow-xl backdrop-blur-lg ${accent ?? ""}`
    },
    React.createElement("div", { className: "text-[0.65rem] uppercase tracking-[0.3em] text-slate-400" }, title),
    React.createElement("div", { className: "mt-4 text-4xl font-semibold text-slate-50" }, value),
    subtitle
      ? React.createElement("div", { className: "mt-2 text-xs uppercase tracking-wide text-slate-400" }, subtitle)
      : null,
    React.createElement("div", { className: "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/15 blur-3xl" })
  );

export function statscard({ events, connection }: props) {
  const metrics = useMemo(() => {
    let cpu_total = 0;
    let cpu_samples = 0;
    let mem_total = 0;
    let mem_samples = 0;
    const agents = new Set<string>();

    for (const entry of events) {
      agents.add(entry.agent_id);
      if (entry.event_type === "metric") {
        if (typeof entry.cpu === "number") {
          cpu_total += entry.cpu;
          cpu_samples += 1;
        }
        if (typeof entry.mem_free === "number") {
          mem_total += entry.mem_free;
          mem_samples += 1;
        }
      }
    }

    return {
      cpu: cpu_samples > 0 ? cpu_total / cpu_samples : 0,
      mem_free: mem_samples > 0 ? mem_total / mem_samples : 0,
      agents: agents.size
    };
  }, [events]);

  const connection_badge = connection === "open" ? "online" : connection;
  const connection_color = connection === "open" ? "text-emerald-400" : connection === "connecting" ? "text-amber-300" : "text-rose-400";

  return React.createElement(
    "div",
    { className: "grid gap-4 md:grid-cols-3" },
    stat_card("avg cpu", `${(metrics.cpu * 100).toFixed(1)}%`, "agent metrics"),
    stat_card("avg free mem", `${(metrics.mem_free / 1024 / 1024).toFixed(0)} MB`, "from metric samples"),
    React.createElement(
      "div",
      { className: "relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 via-panel/60 to-panel/40 p-5 text-emerald-200 shadow-xl" },
      React.createElement("div", { className: "text-[0.65rem] uppercase tracking-[0.3em] text-emerald-200/70" }, "stream"),
      React.createElement("div", { className: `mt-4 text-4xl font-semibold ${connection_color}` }, connection_badge),
      React.createElement("div", { className: "mt-2 text-xs uppercase tracking-wide text-emerald-200/80" }, `${metrics.agents} active agents`),
      React.createElement("div", { className: "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-400/20 blur-3xl" })
    )
  );
}

