import { formatMoney } from "@vsolve/ui";
import type { useT } from "@vsolve/ui";

import type { EngagementStage } from "@/features/engagement/queries";

/**
 * One shift-day summarised in a chip, derived from `EngagementStage.shift_summary`.
 *
 * Contract 1.49.0 publishes `shift_summary` on every A3 stage (null on a
 * project stage), so a day can be summarised from the engagement read alone —
 * no per-day request. The derivation below is the one the spec fixes for both
 * apps; the customer side reads the same fields with its own wording.
 *
 * Pure, so the WORK stack row and the job hub cannot disagree about a day.
 */

export type ShiftSummary = NonNullable<EngagementStage["shift_summary"]>;

export type DayChipTone = "action" | "info" | "neutral" | "warning" | "danger" | "success";

export interface DayChip {
  readonly label: string;
  readonly tone: DayChipTone;
  /** True once the day's money is settled — nothing left to do on it. */
  readonly settled: boolean;
}

/** What the partner sees on a day chip. */
export function describeShiftDay(summary: ShiftSummary, t: ReturnType<typeof useT>): DayChip {
  if (summary.settlement_status === "SETTLED") {
    const amount =
      summary.settlement_amount_paise === null ? "" : ` ${formatMoney(summary.settlement_amount_paise)}`;
    return { label: t("work.dayChip.paid", { amount }), tone: "success", settled: true };
  }
  if (summary.attendance_status === "DISPUTED") {
    return { label: t("work.dayChip.countDisputed"), tone: "danger", settled: false };
  }
  if (summary.settlement_status === "CUSTOMER_CLAIMED") {
    return { label: t("work.dayChip.customerSaysPaid"), tone: "action", settled: false };
  }
  if (summary.attendance_status === "CUSTOMER_CONFIRMED") {
    if (summary.settlement_status === "SUPERVISOR_CLAIMED") {
      return { label: t("work.dayChip.waitingPaymentConfirm"), tone: "info", settled: false };
    }
    const amount =
      summary.settlement_amount_paise === null ? "" : ` ${formatMoney(summary.settlement_amount_paise)}`;
    return { label: t("work.dayChip.collect", { amount }), tone: "action", settled: false };
  }
  if (summary.attendance_status === "SUPERVISOR_CONFIRMED") {
    return {
      label: t("work.dayChip.countWaiting", {
        present: summary.present_count ?? 0,
        expected: summary.expected_count,
      }),
      tone: "info",
      settled: false,
    };
  }
  if (summary.arrived_at !== null) {
    return { label: t("work.dayChip.reached"), tone: "action", settled: false };
  }
  if (summary.crew_named > 0) {
    return { label: t("work.dayChip.crewNamed"), tone: "info", settled: false };
  }
  return { label: t("work.dayChip.nameCrew"), tone: "warning", settled: false };
}

/* --------------------------------------------------------------------------
   Dates
   -------------------------------------------------------------------------- */

/**
 * `scheduled_on` is a bare date (`2026-09-02`). Parsed as a local day rather
 * than through `new Date(iso)`, which reads it as UTC midnight and shifts it a
 * day west of Greenwich.
 */
function localDay(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) {
    const at = new Date(date);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "Mon 2" — the chip's date. */
export function dayChipDate(scheduledOn: string | null): string | null {
  if (scheduledOn === null) return null;
  const at = localDay(scheduledOn);
  if (at === null) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric" }).format(at);
}

/** "Monday" — for the CTA sentence. */
export function dayName(scheduledOn: string | null): string | null {
  if (scheduledOn === null) return null;
  const at = localDay(scheduledOn);
  if (at === null) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(at);
}

/* --------------------------------------------------------------------------
   The next thing to do
   -------------------------------------------------------------------------- */

export interface NextCrewAction {
  readonly label: string;
  readonly stageId: string;
}

/**
 * The primary CTA on the hub: the next day that needs something, and what.
 *
 * Walks the stages in order and stops at the first unsettled, uncancelled
 * shift-day. Null when every day is settled or nothing is a shift-day.
 */
export function nextCrewAction(
  stages: readonly EngagementStage[],
  t: ReturnType<typeof useT>,
): NextCrewAction | null {
  const sorted = [...stages].sort((left, right) => left.position - right.position);
  for (const stage of sorted) {
    const summary = stage.shift_summary;
    if (summary === null || stage.status === "CANCELLED") continue;
    if (summary.settlement_status === "SETTLED") continue;
    const day = dayName(stage.scheduled_on) ?? t("work.dayChip.dayFallback", { position: stage.position });
    return { stageId: stage.id, label: crewActionLabel(summary, day, t) };
  }
  return null;
}

function crewActionLabel(summary: ShiftSummary, day: string, t: ReturnType<typeof useT>): string {
  if (summary.attendance_status === "DISPUTED") return t("work.dayChip.action.sortCount", { day });
  if (summary.settlement_status === "CUSTOMER_CLAIMED") return t("work.dayChip.action.confirmPayment", { day });
  if (summary.settlement_status === "SUPERVISOR_CLAIMED") {
    return t("work.dayChip.action.waitingCustomer", { day });
  }
  if (summary.attendance_status === "CUSTOMER_CONFIRMED") return t("work.dayChip.action.collect", { day });
  if (summary.attendance_status === "SUPERVISOR_CONFIRMED") {
    return t("work.dayChip.action.waitingCustomer", { day });
  }
  if (summary.crew_named === 0) return t("work.dayChip.action.nameCrew", { day });
  if (summary.arrived_at === null) return t("work.dayChip.action.reached", { day });
  return t("work.dayChip.action.close", { day });
}

/* --------------------------------------------------------------------------
   Money
   -------------------------------------------------------------------------- */

/**
 * What the crew has collected directly, summed over settled days. Null when no
 * day is settled yet — a zero would read as "nothing was paid".
 */
export function collectedDirectlyPaise(stages: readonly EngagementStage[]): number | null {
  let total = 0;
  let any = false;
  for (const stage of stages) {
    const summary = stage.shift_summary;
    if (summary === null || summary.settlement_status !== "SETTLED") continue;
    if (summary.settlement_amount_paise === null) continue;
    total += summary.settlement_amount_paise;
    any = true;
  }
  return any ? total : null;
}

/**
 * How many shift-days are settled, and how many the crew booking has in all —
 * the "Day 2 of 3" chip on the WORK stack.
 *
 * `CANCELLED` stages are dropped from the total: a day a recovery cancelled
 * was never worked, and counting it would make a 3-day booking that lost one
 * day to a recovery read as permanently "Day 2 of 3" once the other two settle.
 */
export function settledDayCount(stages: readonly EngagementStage[]): {
  readonly settled: number;
  readonly total: number;
} {
  const live = stages.filter((stage) => stage.status !== "CANCELLED");
  const settled = live.filter((stage) => stage.shift_summary?.settlement_status === "SETTLED");
  return { settled: settled.length, total: live.length };
}
