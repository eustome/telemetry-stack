import React, { useEffect, useRef, useState } from "react";

type option<T extends string | number> = {
  value: T;
  label: string;
};

type props<T extends string | number> = {
  value: T;
  options: option<T>[];
  on_change: (value: T) => void;
  class_name?: string;
  button_class?: string;
  menu_class?: string;
};

export function dropdown<T extends string | number>({
  value,
  options,
  on_change,
  class_name,
  button_class,
  menu_class
}: props<T>) {
  const [open, set_open] = useState(false);
  const anchor_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle_click = (event: MouseEvent) => {
      if (anchor_ref.current && !anchor_ref.current.contains(event.target as Node)) {
        set_open(false);
      }
    };
    window.addEventListener("mousedown", handle_click);
    return () => window.removeEventListener("mousedown", handle_click);
  }, []);

  const selected = options.find((item) => item.value === value);

  const toggle = () => set_open((prev) => !prev);

  const handle_select = (item: option<T>) => {
    on_change(item.value);
    set_open(false);
  };

  return React.createElement(
    "div",
    { ref: anchor_ref, className: ["relative inline-flex", class_name].filter(Boolean).join(" ") },
    React.createElement(
      "button",
      {
        type: "button",
        onClick: toggle,
        className:
          button_class ??
          "inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-panel px-4 py-2 text-sm text-slate-100 transition hover:border-accent focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      },
      selected?.label ?? "select",
      React.createElement("span", { className: "text-accent" }, open ? "▴" : "▾")
    ),
    open
      ? React.createElement(
          "ul",
          {
            className:
              menu_class ??
              "absolute top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-700 bg-panel/95 shadow-2xl backdrop-blur"
          },
          options.map((item) =>
            React.createElement(
              "li",
              {
                key: item.value,
                className: [
                  "cursor-pointer px-4 py-2 text-sm text-slate-100 transition hover:bg-accent/20 hover:text-accent",
                  item.value === value ? "bg-accent/10 text-accent" : ""
                ].join(" "),
                onClick: () => handle_select(item)
              },
              item.label
            )
          )
        )
      : null
  );
}

