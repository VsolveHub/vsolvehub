"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * The layout primitives every Partner screen is built from.
 *
 * ## The problem these replace
 *
 * Before this, each screen invented its own container. Some used
 * `mx-auto w-full max-w-2xl px-4 py-6`, some `flex min-h-[calc(100dvh-9rem)]
 * flex-col bg-canvas`, some neither. Two consequences:
 *
 * - `max-w-2xl` (672px) inside a shell column capped at `max-w-md` (448px) is
 *   dead code. Half the screens declared a width they could never reach.
 * - `calc(100dvh-9rem)` hard-codes the height of the app bar plus the tab bar
 *   as a single magic number, in every file, with no relationship to either
 *   component. Change the tab bar and eleven screens are silently wrong.
 *
 * `Screen` owns both. The scroll container and its bottom inset live in the
 * shell (`partner-shell.tsx`), computed from `--spacing-tabbar` and the device's
 * own `--safe-bottom`, so a screen never needs to know what chrome is above or
 * below it.
 *
 * ## Reading width, not phone width
 *
 * The shell is fluid to 480px and then centred — a phone-native column that
 * does not stretch into an unreadable 1200px line on a tablet or a desktop
 * browser. `Screen` inherits that and adds nothing of its own, so there is
 * exactly one place that decides how wide this app is.
 */

export function Screen({
  children,
  className,
  tone = "canvas",
  /** Pushed (non-tab) screens animate in from the right, the way a native stack does. */
  pushed = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: "canvas" | "surface";
  pushed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-full flex-col",
        tone === "canvas" ? "bg-canvas" : "bg-surface",
        pushed && "pv-push-in",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A block of screen content at the app's standard gutter.
 *
 * 16px on a phone, widening to 20px once there is room. Not larger: the gutter
 * is the one dimension a small screen cannot afford to be generous with, and
 * every pixel of it comes out of a job card's title.
 */
export function Block({
  children,
  className,
  gap = "md",
}: {
  children: ReactNode;
  className?: string;
  gap?: "none" | "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex flex-col px-4 sm:px-5",
        gap === "sm" && "gap-2.5",
        gap === "md" && "gap-3.5",
        gap === "lg" && "gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The label above a group of cards, with its count on the right.
 *
 * The count is not decoration. "Needs you 3" is the single most useful string
 * on the work screen — it is the answer to the question the screen is opened to
 * ask — and it belongs beside the heading rather than being left for the reader
 * to derive by counting cards.
 */
export function SectionHeading({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-0.5">
      <h2 className="flex items-center gap-2 text-micro uppercase text-text-muted">
        {children}
        {count === undefined ? null : (
          <span className="pv-num grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-pill bg-surface-sunken px-1 text-[0.625rem] font-extrabold text-text-secondary">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/**
 * The sticky bar that carries a screen's one committing action.
 *
 * Pushed screens (an offer, an estimate, a job) end in a decision, and on a
 * phone that decision must not be something you scroll to find. The dock pins
 * it to the bottom of the viewport, above the home indicator, with a top edge
 * that only appears once there is content behind it.
 *
 * Sits above the tab bar's inset because a docked screen is a `focused` route,
 * where `partner-shell.tsx` renders no tab bar at all.
 */
export function ActionDock({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-20 mt-auto border-t border-line bg-surface/95 backdrop-blur-sm"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
        {note === undefined ? null : (
          <p className="text-center text-caption text-text-secondary">{note}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * A tinted strip that explains a state without looking like a failure.
 *
 * Used for "you are offline", "we are reconnecting", "some earnings are held".
 * Deliberately not `ErrorState`: none of these are errors, and dressing a
 * normal condition as one teaches a Partner to ignore the treatment that
 * genuinely does mean something is broken.
 */
export function Notice({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: "info" | "warning" | "danger" | "success";
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const skin = {
    info: "border-info-line bg-info-surface text-info-text",
    warning: "border-warning-line bg-warning-surface text-warning-text",
    danger: "border-danger-line bg-danger-surface text-danger-text",
    success: "border-success-line bg-success-surface text-success-text",
  }[tone];

  return (
    <div className={cn("flex gap-3 rounded-card border p-3.5", skin)}>
      {icon === undefined ? null : <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold">{title}</p>
        {children === undefined ? null : (
          <div className="mt-0.5 text-caption opacity-90">{children}</div>
        )}
        {action === undefined ? null : <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
