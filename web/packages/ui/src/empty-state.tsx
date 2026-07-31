import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Empty state.
 *
 * An empty screen is an instruction, not an apology. It says what is not here,
 * why, and the one thing to do next.
 *
 * This component exists partly to make the honest choice the easy one. The
 * tempting alternative when a list comes back empty is to render sample data so
 * the screen looks alive — placeholder providers, example bookings, a fake
 * rating. Plan 08 records what that cost the partner app: staff could not tell
 * operational truth from demo content. If there is nothing, say so.
 *
 * `reason` distinguishes the two cases that look identical but need different
 * words: nothing exists yet, versus a filter excluded everything.
 */

export interface EmptyStateProps {
  /** What is not here. "No bookings yet", not "Nothing to see". */
  title: string;
  /** Why, and what changes it. One or two sentences. */
  description?: string;
  /** Primary action. Omit when the user genuinely cannot act. */
  action?: ReactNode;
  /** Line drawing or glyph. Never an emoji (plan 03). */
  icon?: ReactNode;
  /** Tightens spacing for use inside a card rather than a full page. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        "rounded-card border border-dashed border-line bg-surface",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="text-text-muted">
          {icon}
        </span>
      ) : null}

      <p className={cn("font-semibold text-text", compact ? "text-sm" : "text-base")}>{title}</p>

      {description ? (
        <p className={cn("max-w-prose text-text-secondary", compact ? "text-xs" : "text-sm")}>
          {description}
        </p>
      ) : null}

      {action ? <div className={compact ? "mt-1" : "mt-2"}>{action}</div> : null}
    </div>
  );
}
