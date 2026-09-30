import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * The readout plate — this system's signature device.
 *
 * Three values in this product must never be misread: what it costs, how much
 * time is left, and the code spoken at the door. They appear in both apps, they
 * are the moments where trust is won or lost, and they are exactly the values a
 * generic card treatment renders as ordinary body text.
 *
 * So they share one recognisable form: a bounded plate, near-square corners, a
 * signal-orange rule, and tabular numerals set larger and tighter than anything
 * around them. It reads like a meter face or the stamped panel on a job card,
 * which is the vernacular of the trades this marketplace serves.
 *
 * The device is deliberately the only bold thing in the system. Everything
 * around it stays quiet so that when a customer looks at their phone in a
 * doorway, the number they need is the thing they see.
 */

type Tone = "neutral" | "active" | "success" | "warning" | "danger";

const tones: Record<Tone, { plate: string; rule: string; value: string }> = {
  neutral: {
    plate: "bg-surface border-line",
    rule: "bg-line-strong",
    value: "text-text",
  },
  active: {
    plate: "bg-surface border-signal-200",
    rule: "bg-action",
    value: "text-text",
  },
  // A settled figure — an allocation that reconciles, a balance that is zero
  // because it should be. Distinct from `active`, which says "this is the number
  // that matters now"; success says "this one is finished". Without it the
  // installment editor's "Still to allocate ₹0" reads the same as an outstanding
  // balance, which is the one thing that plate exists to distinguish.
  success: {
    plate: "bg-success-surface border-success-line",
    rule: "bg-success-text",
    value: "text-success-text",
  },
  warning: {
    plate: "bg-warning-surface border-warning-line",
    rule: "bg-warning-text",
    value: "text-warning-text",
  },
  danger: {
    plate: "bg-danger-surface border-danger-line",
    rule: "bg-danger-text",
    value: "text-danger-text",
  },
};

const sizes = {
  sm: { value: "text-xl", label: "text-[0.6875rem]", pad: "px-3 py-2" },
  md: { value: "text-3xl", label: "text-xs", pad: "px-4 py-3" },
  lg: { value: "text-5xl", label: "text-xs", pad: "px-5 py-4" },
} as const;

export interface ReadoutProps {
  /** What this value is. Always present — a bare number is not self-describing. */
  label: string;
  /** The formatted value. Use `formatMoney`, `formatDuration` or a raw code. */
  value: string;
  tone?: Tone;
  size?: keyof typeof sizes;
  /** Extra context under the value, e.g. "Ends 11:30 am". */
  caption?: string;
  /** Widens letter spacing. Used for OTP codes, which are read aloud digit by digit. */
  spaced?: boolean;
  /**
   * Replaces the announced text. A ticking countdown must not be announced every
   * second — see `Countdown`, which supplies a calmer summary here.
   */
  announce?: string;
  trailing?: ReactNode;
  className?: string;
}

export function Readout({
  label,
  value,
  tone = "neutral",
  size = "md",
  caption,
  spaced = false,
  announce,
  trailing,
  className,
}: ReadoutProps) {
  const t = tones[tone];
  const s = sizes[size];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-plate border",
        t.plate,
        s.pad,
        className,
      )}
    >
      {/* The rule is the constant across every instance of the device — it is
          what makes a price, a timer and an OTP read as the same kind of thing. */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", t.rule)} />

      <div className="flex items-end justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.08em] text-text-secondary",
              s.label,
            )}
          >
            {label}
          </p>
          <p
            data-numeric
            // Hidden from assistive tech when `announce` is supplied, so the
            // caller controls what is read rather than every digit change.
            aria-hidden={announce ? true : undefined}
            className={cn(
              "mt-0.5 font-bold leading-none",
              t.value,
              s.value,
              spaced && "tracking-[0.2em]",
            )}
          >
            {value}
          </p>
          {announce ? <span className="sr-only">{announce}</span> : null}
          {caption ? <p className="mt-1.5 text-xs text-text-secondary">{caption}</p> : null}
        </div>

        {trailing ? <div className="shrink-0 pb-0.5">{trailing}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Formatters
   --------------------------------------------------------------------------- */

export function formatInrRupees(
  amountRupees: number,
  options: { showPaise?: boolean } = {},
): string {
  const hasPaise = amountRupees % 1 !== 0;
  const showPaise = options.showPaise ?? hasPaise;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(amountRupees);
}

/**
 * Formats integer paise as rupees.
 *
 * Uses the `en-IN` locale so grouping follows the lakh/crore convention —
 * ₹1,23,456 rather than ₹123,456. Getting this wrong is immediately visible to
 * an Indian customer and reads as a foreign product.
 *
 * Money is integer paise everywhere (plan 09 §10). This is the only place it
 * becomes a string, and nothing may do arithmetic on the result.
 */
export function formatMoney(
  amountPaise: number,
  options: { showPaise?: boolean } = {},
): string {
  return formatInrRupees(amountPaise / 100, options);
}

/**
 * Parses common free-text ranges like `25000 - 45000`, optional existing ₹/commas,
 * and reformats numeric tokens with Indian commas + ₹.
 * Preserves non-numeric suffixes (e.g. `/ year`, `LPA`).
 */
export function formatMoneyText(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  // Remove existing ₹ symbols (and optional following spaces) so we don't double up
  const text = raw.replace(/₹\s*/g, "");

  // Match numbers (digits, optional commas, optional decimals)
  const regex = /\b\d[\d,]*(\.\d+)?/g;

  return text.replace(regex, (match) => {
    const num = parseFloat(match.replace(/,/g, ""));
    if (Number.isNaN(num)) return match;
    return formatInrRupees(num);
  });
}

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function coerceDate(value: Date | string | number): Date | null {
  // Date-only wires (`YYYY-MM-DD`) parse as UTC midnight in JS, which flips the
  // calendar day west of UTC. Build a local noon Date from the parts instead.
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const local = new Date(year, month - 1, day, 12, 0, 0);
      return Number.isNaN(local.getTime()) ? null : local;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Human-visible calendar date in Indian order: DD/MM/YYYY (e.g. 27/09/2026).
 *
 * API / DB / wire values stay ISO `YYYY-MM-DD`. This is display only — never
 * feed the result back into a wire payload.
 */
export function formatDate(value: Date | string | number): string {
  const date = coerceDate(value);
  return date === null ? "" : DATE_ONLY.format(date);
}

/**
 * Parse a human DD/MM/YYYY (or D/M/YYYY) string into an ISO `YYYY-MM-DD` wire value.
 * Returns `null` when the text is empty or not a real calendar day.
 */
export function parseDisplayDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const mm = `${month}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Human-visible date+time with Indian day order (e.g. 27/09/2026, 1:30 pm).
 */
export function formatDateTime(value: Date | string | number): string {
  const date = coerceDate(value);
  return date === null ? "" : DATE_TIME.format(date);
}

/**
 * Formats a duration as HH:MM:SS, dropping the hour segment under an hour.
 *
 * Always takes a already-computed millisecond value — never a deadline — so a
 * caller cannot accidentally compute a countdown from an unsynchronised device
 * clock. Use `serverClock.remainingMs(deadline)` from `@vsolve/api-client` to
 * produce it.
 */
export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Spoken form of a duration, for the accessible announcement.
 *
 * Deliberately coarse: "about 4 minutes left" is useful, "3 minutes 47 seconds"
 * re-announced every second is not.
 */
export function describeDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  if (totalSeconds === 0) return "No time remaining";
  if (totalSeconds < 60) return "Less than a minute remaining";

  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `About ${minutes} minute${minutes === 1 ? "" : "s"} remaining`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0
    ? `About ${hourPart} remaining`
    : `About ${hourPart} ${rest} minute${rest === 1 ? "" : "s"} remaining`;
}
