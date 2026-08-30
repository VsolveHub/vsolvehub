import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * One fact, sized to be read at arm's length on a phone.
 *
 * Partners read these standing on a stairwell with one hand free, so the value
 * is set larger and heavier than the label above it — the opposite of a form
 * field, where the label leads. Four of these in a 2x2 grid replace the
 * paragraph that a desktop layout would have used.
 *
 * `locked` is the state that carries a product rule rather than a style: before
 * the customer has paid, the exact address and phone number exist but must not
 * be shown. A locked tile keeps the row in place and says so, which is honest;
 * hiding the row entirely would let a partner think there was no address to
 * come. The dashed edge and the sunken plate make it distinguishable without
 * relying on colour, per plan 03.
 */

export interface FactTileProps {
  /** Decorative. The label carries the meaning. */
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** Withheld until some server-side condition is met. */
  locked?: boolean;
  /** Optional click handler to view detailed information. */
  onClick?: () => void;
  className?: string;
}

export function FactTile({
  icon,
  label,
  value,
  locked = false,
  onClick,
  className,
}: FactTileProps) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-[14px]",
          locked ? "bg-surface-sunken text-text-muted" : "bg-selected-surface text-text-link",
        )}
      >
        {icon}
      </span>

      <span className="flex min-w-0 flex-col text-left">
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 truncate text-sm font-extrabold tracking-[-0.015em] tabular-nums",
            locked ? "text-text-muted" : "text-text",
          )}
        >
          {value}
        </span>
      </span>
    </>
  );

  const containerClassName = cn(
    "flex items-center gap-3 rounded-card p-3",
    locked
      ? "border border-dashed border-warm-400 bg-transparent"
      : "border border-line bg-surface",
    onClick && "cursor-pointer text-left transition-all hover:bg-surface-hover active:scale-[0.98]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={containerClassName}>
        {content}
      </button>
    );
  }

  return <div className={containerClassName}>{content}</div>;
}
