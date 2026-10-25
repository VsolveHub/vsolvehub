"use client";

import { Clock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const QUARTER_HOURS = [0, 15, 30, 45];

function parts(value: string): { hour12: number; minute: number; pm: boolean } {
  const [h = 10, m = 0] = value.split(":").map(Number);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

function toValue(hour12: number, minute: number, pm: boolean): string {
  const h = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function clockText(value: string): string {
  if (!value) return "Set time";
  const { hour12, minute, pm } = parts(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

/**
 * A compact time chip: "10:00 AM". Tapping it opens a small panel — hour, minutes,
 * AM/PM — instead of a long list of every quarter hour.
 *
 * Shared by stay visiting hours (quarter hours) and rental pickup hours, whose server
 * accepts only the hour and half hour — so the minutes on offer are the caller's.
 */
export function TimePicker({
  value,
  onChange,
  label,
  minutes = QUARTER_HOURS,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  minutes?: readonly number[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { hour12, minute, pm } = parts(value || "10:00");

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cell = (on: boolean) =>
    `h-9 rounded-control text-sm font-semibold transition ${
      on ? "bg-navy-900 text-white" : "bg-surface-sunken text-text hover:bg-selected-surface"
    }`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`${label}: ${clockText(value)}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-10 min-w-[7.5rem] items-center justify-between gap-2 rounded-full border px-3.5 text-sm font-bold tabular-nums transition ${
          open
            ? "border-navy-900 bg-surface text-navy-900 ring-2 ring-navy-900/10"
            : "border-line bg-surface text-navy-900 hover:border-navy-700"
        }`}
      >
        {clockText(value)}
        <Clock className="size-4 text-text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-card border border-line bg-surface p-3 shadow-overlay"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Hour</p>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {HOURS.map((h) => (
              <button key={h} type="button" className={cell(h === hour12)} onClick={() => onChange(toValue(h, minute, pm))}>
                {h}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Minutes</p>
          <div
            className="mt-1.5 grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${minutes.length}, minmax(0, 1fr))` }}
          >
            {minutes.map((m) => (
              <button key={m} type="button" className={cell(m === minute)} onClick={() => onChange(toValue(hour12, m, pm))}>
                :{String(m).padStart(2, "0")}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-control bg-surface-sunken p-1">
            {(["AM", "PM"] as const).map((p) => {
              const on = (p === "PM") === pm;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(toValue(hour12, minute, p === "PM"))}
                  className={`h-8 rounded-[calc(var(--radius-control)-2px)] text-sm font-bold transition ${
                    on ? "bg-surface text-navy-900 shadow-xs" : "text-text-secondary hover:text-navy-900"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 h-9 w-full rounded-control bg-action text-sm font-bold text-action-text hover:bg-action-hover"
          >
            Done · {clockText(value || "10:00")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
