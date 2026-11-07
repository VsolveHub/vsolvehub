// Ported from frontend/apps/partner/features/shift/model/shift-copy.ts
import type {
  CrewIneligibility,
  CrewReleaseReason,
  CrewSelectionProblem,
  ShiftDayPhase,
  ShiftSafetyCategory,
  ShiftSafetySeverity,
  ShiftSettlementClaim,
} from "@vsolve/query/native";

import type { PartnerCrewNoShowReason } from "../queries";

/**
 * Every word the shift-day screens say, in one file.
 *
 * `@vsolve/query` decides what is *true* about a day; this decides how it is
 * *said*. Every string here is at most one sentence — the explanations live on
 * the "How day-hire works" page, not on a screen a supervisor reads at six in
 * the evening with a crew waiting.
 *
 * Three things this file must keep true: the platform never holds the wages;
 * arrival is a person's word and needs no apology; a safety report is a record,
 * never a cancellation.
 */

export type Tone = "action" | "info" | "neutral" | "warning" | "success";

/** The day-chip label for each phase, partner side. */
export const PHASE_LABEL: Record<ShiftDayPhase, { readonly label: string; readonly tone: Tone }> = {
  needs_crew: { label: "Name crew", tone: "action" },
  crew_named: { label: "Crew named", tone: "info" },
  on_site: { label: "Reached", tone: "info" },
  recorded: { label: "Waiting for customer", tone: "info" },
  answered: { label: "Customer answered", tone: "info" },
  settled: { label: "Paid", tone: "success" },
};

/** Why a name came off the day. Client vocabulary — see `CREW_RELEASE_REASONS`. */
export const RELEASE_REASON_LABEL: Record<CrewReleaseReason, string> = {
  substituted: "Somebody else is going",
  unwell: "Unwell",
  did_not_report: "Did not report",
  reassigned: "Moved to another job",
};

/** One line under a greyed roster row. */
export const INELIGIBILITY_WORDING: Record<CrewIneligibility, string> = {
  archived: "Off your roster",
  unverified: "Documents pending",
};

export function describeSelectionProblem(
  problem: CrewSelectionProblem,
  headcount: number | null,
): string {
  switch (problem) {
    case "no_eligible_crew":
      return "Nobody on your roster is verified yet.";
    case "empty":
      return "Tick at least one person.";
    case "over_headcount":
      return headcount === null
        ? "That is more people than were booked."
        : `Booked for ${headcount} — extra people are an add-on, not a longer list.`;
  }
}

export const SEVERITY_LABEL: Record<ShiftSafetySeverity, string> = {
  CRITICAL: "Critical",
  SERIOUS: "Serious",
  MINOR: "Minor",
  NEAR_MISS: "Near miss",
};

/** The four kinds the problem sheet offers; the rest of the enum stays reachable through support. */
export const SAFETY_KIND_TILES: readonly { readonly value: ShiftSafetyCategory; readonly label: string }[] = [
  { value: "injury", label: "Someone hurt" },
  { value: "unsafe-site", label: "Site unsafe" },
  { value: "equipment-failure", label: "Equipment" },
  { value: "other", label: "Other" },
];

export const NO_SHOW_REASON_LABEL: Record<PartnerCrewNoShowReason, string> = {
  customer_no_show: "Nobody home",
  gate_locked: "Gate locked",
};

/**
 * What the settlement record says, in the supervisor's own terms.
 *
 * `supervisor_only` is one person's word standing unanswered; it is said as
 * "waiting", never as "paid" and never as "unproven".
 */
export function settlementLabel(
  claim: ShiftSettlementClaim,
  customerFirstName: string,
): { readonly label: string; readonly tone: Tone } {
  switch (claim) {
    case "no_amount":
      return { label: "No amount yet", tone: "neutral" };
    case "awaiting_both":
      return { label: "Collect today", tone: "action" };
    case "supervisor_only":
      return { label: `Waiting for ${customerFirstName}`, tone: "warning" };
    case "customer_only":
      return { label: `${customerFirstName} says paid — confirm`, tone: "action" };
    case "settled":
      return { label: "Paid ✓", tone: "success" };
  }
}

/** The one line under the settlement buttons. */
export const SETTLEMENT_STAYS_OPEN =
  "Not paid yet? It stays open — both of you tap when it's done.";

/** Day 1 only, under "We've reached". */
export const DAY_ONE_EARNS_FEE =
  "Day 1: this also earns Vsolve's booking fee. Wages are paid to you directly.";

/** After a safety report is filed. */
export const SAFETY_LOGGED = "Logged. Job continues; support will call.";

/** The honest line where a cancel button would be. */
export const CALL_SUPPORT_TO_CANCEL = "Call support to cancel — there is no cancel button here.";

/** The customer's first name, or a neutral fallback when the contact is not released yet. */
export function customerFirstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first === "" ? "the customer" : first;
}
