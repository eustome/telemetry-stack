import React from "react";
import type { eventrecord } from "../types";
import { dropdown } from "./dropdown";

type props = {
  events: eventrecord[];
  total: number;
  page: number;
  page_size: number;
  on_page_change: (page: number) => void;
  on_page_size_change: (size: number) => void;
  page_size_options: number[];
};

const headers = ["agent", "event", "cpu", "memory", "process", "details", "ingested"];

const format_cpu = (value?: number) => {
  if (typeof value !== "number") {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const format_memory = (mem_free?: number, rss?: number) => {
  if (typeof rss === "number") {
    return `${(rss / 1024 / 1024).toFixed(0)} MB`;
  }
  if (typeof mem_free === "number") {
    return `${(mem_free / 1024 / 1024).toFixed(0)} MB`;
  }
  return "—";
};

const format_details = (event: eventrecord) => {
  if (event.event_type === "proc") {
    const pid = typeof event.pid === "number" ? `#${event.pid}` : "";
    const rss = typeof event.rss === "number" ? `• ${(event.rss / 1024 / 1024).toFixed(0)} MB rss` : "";
    return `${event.proc_name ?? "unknown"} ${pid} ${rss}`.trim();
  }
  return event.platform;
};

const build_paginator = (
  total: number,
  page: number,
  page_size: number,
  on_page_change: (page: number) => void,
  on_page_size_change: (size: number) => void,
  page_size_options: number[]
) => {
  const total_pages = Math.max(1, Math.ceil(total / page_size));
  const start = total === 0 ? 0 : (page - 1) * page_size + 1;
  const end = Math.min(total, page * page_size);

  return React.createElement(
    "div",
    { className: "flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-panel/80 px-4 py-3 backdrop-blur" },
    React.createElement(
      "div",
      { className: "text-xs uppercase tracking-wide text-slate-400" },
      `showing ${start}-${end} of ${total}`
    ),
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-3 text-sm text-slate-200" },
      React.createElement(
        "label",
        { className: "flex items-center gap-2" },
        "rows",
        React.createElement(dropdown, {
          value: page_size,
          on_change: (value: number) => on_page_size_change(Number(value)),
          options: page_size_options.map((option) => ({ value: option, label: option.toString() })),
          class_name: "h-full",
          button_class:
            "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-panel px-3 py-1 text-xs uppercase tracking-wide text-slate-100 transition hover:border-accent focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
          menu_class: "absolute top-full z-30 mt-1 min-w-[6rem] overflow-hidden rounded-xl border border-slate-700 bg-panel/95 shadow-2xl backdrop-blur"
        })
      ),
      React.createElement(
        "div",
        { className: "flex items-center gap-2" },
        React.createElement(
          "button",
          {
            className: "rounded-md border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
            disabled: page <= 1,
            onClick: () => on_page_change(Math.max(1, page - 1))
          },
          "prev"
        ),
        React.createElement(
          "span",
          { className: "text-xs uppercase tracking-wide text-slate-400" },
          `${page}/${total_pages}`
        ),
        React.createElement(
          "button",
          {
            className: "rounded-md border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
            disabled: page >= total_pages,
            onClick: () => on_page_change(Math.min(total_pages, page + 1))
          },
          "next"
        )
      )
    )
  );
};

const render_row = (event: eventrecord, index: number) => {
  const timestamp = new Date(event.ingested_at ?? event.ts);
  const cpu = format_cpu(event.cpu);
  const memory = format_memory(event.mem_free, event.rss);
  const detail = format_details(event);
  const badge_class =
    event.event_type === "metric"
      ? "bg-glow/20 text-glow border border-glow/50"
      : "bg-ember/15 text-ember border border-ember/50";
  const cells = [
    React.createElement(
      "div",
      { className: "flex items-center gap-2" },
      React.createElement("span", { className: "text-sm font-semibold text-slate-100" }, event.agent_id)
    ),
    React.createElement(
      "span",
      { className: `inline-flex items-center justify-center rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] ${badge_class}` },
      event.event_type
    ),
    cpu,
    memory,
    event.proc_name ?? "—",
    detail,
    timestamp.toLocaleTimeString()
  ];

  return React.createElement(
    "tr",
    {
      key: event.id,
      className: "border-b border-slate-800/60 transition duration-200 hover:bg-slate-800/40"
    },
    cells.map((value, idx) =>
      React.createElement(
        "td",
        {
          key: `${event.id}-${idx}`,
          className: "px-4 py-3 text-sm text-slate-200"
        },
        value
      )
    )
  );
};

export function eventstable(props: props) {
  const { events, total, page, page_size, on_page_change, on_page_size_change, page_size_options } = props;

  const table_header = React.createElement(
    "thead",
    null,
    React.createElement(
      "tr",
      null,
      headers.map((label) =>
        React.createElement(
          "th",
          {
            key: label,
            className: "px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-accent/70"
          },
          label
        )
      )
    )
  );

  const table_body =
    events.length === 0
      ? React.createElement(
          "tbody",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement(
              "td",
              {
                colSpan: headers.length,
                className: "px-4 py-12 text-center text-sm text-slate-500"
              },
              "no events captured yet"
            )
          )
        )
      : React.createElement(
          "tbody",
          null,
          events.map((event: eventrecord, index: number) => render_row(event, index))
        );

  return React.createElement(
    "div",
    { className: "overflow-hidden rounded-3xl border border-slate-800/70 bg-gradient-to-br from-panel/90 via-panel/70 to-panel/40 shadow-2xl backdrop-blur-lg" },
    build_paginator(total, page, page_size, on_page_change, on_page_size_change, page_size_options),
    React.createElement(
      "div",
      { className: "overflow-x-auto" },
      React.createElement(
        "table",
        { className: "min-w-full divide-y divide-slate-800/60" },
        table_header,
        table_body
      )
    )
  );
}

