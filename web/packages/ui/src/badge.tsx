import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Compact status label.
 *
 * Plan 03: state is never communicated by colour alone. A badge therefore always
 * renders text, and `dot` adds a shape cue for the operational states partners
 * scan quickly in poor light. Colour is reinforcement, never the message — a
 * badge reading "Cancelled" survives greyscale printing and deuteranopia.
 *
 * Tones map to semantic roles rather than raw hues, so `warning` cannot drift
 * into the brand orange it has to stay distinguishable from.
 */

type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "action"
  /** @deprecated Use `info` for informational, `action` for brand emphasis. */
  | "brand";

const INFO = "bg-info-surface text-info-text ring-info-line";

const tones: Record<Tone, string> = {
  success: "bg-success-surface text-success-text ring-success-line",
  warning: "bg-warning-surface text-warning-text ring-warning-line",
  danger: "bg-danger-surface text-danger-text ring-danger-line",
  info: INFO,
  brand: INFO,
  neutral: "bg-surface-sunken text-text-secondary ring-line",
  // Brand emphasis for product labels such as "Instant" — deliberately distinct
  // from `warning`, so a promoted label never reads as a problem.
  action: "bg-signal-50 text-signal-700 ring-signal-200",
};

export interface BadgeProps {
  tone?: Tone;
  /** Adds a filled dot so the state is distinguishable without relying on hue. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-xs font-semibold",
        // A hairline ring keeps the badge legible on a tinted card, where a pale
        // fill on a pale surface can disappear.
        "ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
