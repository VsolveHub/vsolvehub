import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Presentational error state.
 *
 * Deliberately dependency-free: it accepts plain props rather than importing
 * from `@vsolve/query`, so the design system never depends on the data layer.
 * Apps compose `AppErrorBoundary` (query) with this component (ui).
 *
 * Every error surface must answer three things (plan document 03):
 *   1. What happened            -> `title`
 *   2. Whether state changed    -> `message`, which must say it plainly
 *   3. What to do next          -> `actionLabel` + `onAction`, or a support path
 *
 * "Something went wrong" with no reference and no action is not acceptable, so
 * `reference` renders whenever the backend supplied one.
 */

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorStateProps {
  title: string;
  message: string;
  severity?: ErrorSeverity;
  /** Primary recovery affordance. Omit only when nothing can be retried. */
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary path, typically "Contact support". */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Backend correlation id, shown so support can find the request. */
  reference?: string | null;
  /** Renders in place of the default glyph. */
  icon?: ReactNode;
  /** Compact variant for inline placement inside a card or form. */
  inline?: boolean;
  className?: string;
}

/**
 * Status roles rather than raw palette steps.
 *
 * These four pairings — text on its own tinted surface, and the line against
 * that surface — are the ones `tokens.contrast.test.ts` verifies. The previous
 * values were Tailwind's default red/amber/blue, which nothing measured and
 * which read as a different product from everything around them.
 */
const SEVERITY_STYLES: Record<ErrorSeverity, { container: string; icon: string }> = {
  error: {
    container: "border-danger-line bg-danger-surface text-danger-text",
    icon: "text-danger-text",
  },
  warning: {
    container: "border-warning-line bg-warning-surface text-warning-text",
    icon: "text-warning-text",
  },
  info: {
    container: "border-info-line bg-info-surface text-info-text",
    icon: "text-info-text",
  },
};

/** Inline SVG rather than an emoji, so it is not read aloud as a word. */
function SeverityIcon({ severity, className }: { severity: ErrorSeverity; className?: string }) {
  const shared = {
    className: cn("h-5 w-5 shrink-0", className),
    viewBox: "0 0 20 20",
    fill: "currentColor",
    "aria-hidden": true as const,
  };

  if (severity === "info") {
    return (
      <svg {...shared}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.515 2.63H3.72c-1.345 0-2.188-1.463-1.515-2.63L8.485 2.495zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ErrorState({
  title,
  message,
  severity = "error",
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  reference,
  icon,
  inline = false,
  className,
}: ErrorStateProps) {
  const styles = SEVERITY_STYLES[severity];

  return (
    <div
      // `alert` interrupts a screen reader immediately, which is right for an
      // error. `status` is polite, which is right for an informational state.
      role={severity === "info" ? "status" : "alert"}
      aria-live={severity === "info" ? "polite" : "assertive"}
      className={cn(
        "flex gap-3 rounded-[--radius-card] border",
        inline ? "p-3 text-sm" : "flex-col items-start p-5 sm:flex-row sm:items-start",
        styles.container,
        className,
      )}
    >
      <div className={cn("flex", inline ? "pt-0.5" : "pt-1")}>
        {icon ?? <SeverityIcon severity={severity} className={styles.icon} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold", inline ? "text-sm" : "text-base")}>{title}</p>
        <p className={cn("mt-1 text-balance opacity-90", inline ? "text-sm" : "text-sm")}>
          {message}
        </p>

        {(actionLabel ?? secondaryLabel) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                // 44px minimum touch target (plan 03 interaction requirements).
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-lg px-4",
                  "text-sm font-semibold",
                  "bg-white/80 ring-1 ring-current/20",
                  "hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-current",
                )}
              >
                {actionLabel}
              </button>
            ) : null}

            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-lg px-4",
                  "text-sm font-medium underline underline-offset-4",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                )}
              >
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        {reference ? (
          // `break-all`: a Next error digest is 64 unbroken hex characters, which
          // is wider than a 375px viewport and pushes the whole page sideways.
          <p className="mt-3 font-mono text-xs opacity-70">
            Reference: <span className="select-all break-all">{reference}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
