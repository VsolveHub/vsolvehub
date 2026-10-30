/**
 * Chart colours and number formats for the Operations dashboards.
 *
 * Recharts paints SVG attributes, so these are the hex values of tokens in
 * `@vsolve/ui/tokens.css` rather than CSS variables. The two series colours
 * (`signal-600`, `navy-500`) were checked as a pair for colour-blind separation
 * and for 3:1 contrast on the white chart surface; brand `signal-500` fails that
 * contrast, which is why the darker step is used.
 */

export const CHART_COLORS = {
  /** First series: money in, bookings, signups. */
  primary: "#d65e00",
  /** Second series, only beside the first: refunds against GMV. */
  secondary: "#2551a3",
  grid: "#e7e2da",
  axis: "#756c5e",
  surface: "#ffffff",
} as const;

/** Reserved for outcomes; always shown with a label, never colour alone. */
export const STATUS_COLORS = {
  good: "#0e7c3a",
  bad: "#b3261e",
  warning: "#c27a00",
  neutral: "#7d9ad6",
} as const;

/** ₹ for an axis tick: ₹950, ₹12k, ₹3.4L, ₹1.2Cr. */
export function compactRupees(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const trim = (value: number) => value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
  if (abs >= 1e7) return `₹${trim(rupees / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(rupees / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(rupees / 1e3)}k`;
  return `₹${Math.round(rupees)}`;
}

export type Granularity = "day" | "week";

/** `2026-10-07` → `7 Oct` (a day) or `w/c 5 Oct` (a week). Read as a calendar date, not UTC. */
export function bucketLabel(isoDate: string, granularity: Granularity, long = false): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const text = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(long ? { year: "numeric" } : {}),
  });
  return granularity === "week" ? (long ? `Week of ${text}` : `w/c ${text}`) : text;
}

/** `PAYMENT_PENDING` → `Payment pending`. */
export function statusLabel(code: string): string {
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
