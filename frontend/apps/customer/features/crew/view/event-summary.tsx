"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * What the customer has said so far, as one card the rate sits beside.
 *
 * The same lines feed the phone's rate screen, the desktop review stage and
 * the sticky plan rail, so the three never describe three different events.
 * Every value is a label the customer chose or the catalogue published; the
 * card formats nothing on its own.
 */

export interface SummaryLine {
  key: string;
  label: string;
  /** Null renders the placeholder — "Not chosen" — rather than an empty row. */
  value: string | null;
  icon?: ReactNode;
}

export function EventSummaryCard({
  title = "Your event",
  lines,
  onChange,
  changeLabel = "Change",
  className,
}: {
  title?: string;
  lines: readonly SummaryLine[];
  onChange?: () => void;
  changeLabel?: string;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[16px] border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{title}</h3>
        {onChange ? (
          <button
            type="button"
            onClick={onChange}
            className="min-h-9 text-[13px] font-bold text-text-link hover:underline"
          >
            {changeLabel}
          </button>
        ) : null}
      </div>
      <dl className="divide-y divide-line">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-3 px-3.5 py-2.5">
            {line.icon ? (
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-action-surface text-navy-700 [&>svg]:size-[18px]"
              >
                {line.icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                {line.label}
              </dt>
              <dd
                className={cn(
                  "text-sm font-semibold leading-5",
                  line.value === null ? "text-text-muted" : "text-text",
                )}
              >
                {line.value ?? "Not chosen"}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
