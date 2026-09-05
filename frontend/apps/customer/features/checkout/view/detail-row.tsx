"use client";

import { Button, type ButtonProps } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * One line of the booking-details card: what it is, what it is set to, and the
 * one control that changes it.
 *
 * The value slot takes a node rather than a string because a booking can have
 * several visits, and those are a list rather than a sentence. Everything else
 * about the row stays identical so the column still scans as one card.
 *
 * `action` is optional: a row with nothing to change — the number we send
 * confirmation to — should not carry a dead Edit button.
 */
export interface DetailRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Defaults to outline. Primary is for the empty Address row's Add address CTA. */
  actionVariant?: ButtonProps["variant"];
  isFirst?: boolean;
}

export function DetailRow({
  icon,
  label,
  children,
  actionLabel,
  onAction,
  actionVariant = "outline",
  isFirst = false,
}: DetailRowProps) {
  return (
    <div
      className={
        isFirst
          ? "flex items-start gap-4 p-5"
          : "flex items-start gap-4 border-t border-line p-5"
      }
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-text-muted">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        <div className="mt-1 text-sm text-text-secondary">{children}</div>
      </div>

      {actionLabel !== undefined && onAction !== undefined ? (
        <Button size="sm" variant={actionVariant} className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* Inline rather than a dependency: three 20px glyphs do not justify an icon
   package, and these are decorative — every row is labelled in text. */

export function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
