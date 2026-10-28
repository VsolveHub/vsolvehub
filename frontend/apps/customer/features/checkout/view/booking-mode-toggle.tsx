"use client";

import { Badge, cn } from "@vsolve/ui";
import type { InstantView } from "../../booking/adapters/windows";

export type BookingMode = "INSTANT" | "SCHEDULED";

export interface BookingModeToggleProps {
  value: BookingMode;
  onChange: (mode: BookingMode) => void;
  instant?: InstantView | null;
  disabled?: boolean;
}

export function BookingModeToggle({
  value,
  onChange,
  instant,
  disabled = false,
}: BookingModeToggleProps) {
  const isInstantAvailable = instant?.isAvailable === true;

  const unavailableReasonText = (() => {
    if (isInstantAvailable) return null;
    switch (instant?.unavailableReason) {
      case "NO_ONLINE_PARTNERS":
        return "No professionals currently online. Schedule for later instead.";
      case "OUTSIDE_OPERATING_HOURS":
        return "Outside operating hours. Schedule for later instead.";
      case "NO_CAPACITY":
        return "No instant capacity available right now. Schedule for later instead.";
      default:
        return "Instant booking is unavailable right now. Schedule for later instead.";
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Booking mode"
        className="flex rounded-xl bg-surface-muted p-1 border border-line"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === "INSTANT"}
          disabled={disabled || !isInstantAvailable}
          onClick={() => onChange("INSTANT")}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150",
            value === "INSTANT"
              ? "bg-surface text-text shadow-sm ring-1 ring-black/5"
              : isInstantAvailable
                ? "text-text-secondary hover:text-text cursor-pointer"
                : "text-text-muted/60 cursor-not-allowed bg-transparent",
          )}
        >
          <span>⚡ Instant / ASAP</span>
          {isInstantAvailable && instant?.etaMinutes ? (
            <Badge tone="success" className="text-xs">
              ~{instant.etaMinutes}m
            </Badge>
          ) : null}
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={value === "SCHEDULED"}
          disabled={disabled}
          onClick={() => onChange("SCHEDULED")}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer",
            value === "SCHEDULED"
              ? "bg-surface text-text shadow-sm ring-1 ring-black/5"
              : "text-text-secondary hover:text-text",
          )}
        >
          <span>📅 Schedule for later</span>
        </button>
      </div>

      {unavailableReasonText ? (
        <p className="text-xs text-text-muted px-1 leading-relaxed">
          {unavailableReasonText}
        </p>
      ) : null}
    </div>
  );
}
