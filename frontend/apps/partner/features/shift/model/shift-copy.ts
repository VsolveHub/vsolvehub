import type {
  CrewIneligibility,
  CrewReleaseReason,
  CrewSelectionProblem,
  ShiftDayPhase,
  ShiftSafetyCategory,
  ShiftSafetySeverity,
  ShiftSettlementClaim,
} from "@vsolve/query";
import type { useT } from "@vsolve/ui";

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
export const PHASE_LABEL: Record<ShiftDayPhase, { readonly labelKey: string; readonly tone: Tone }> = {
  needs_crew: { labelKey: "work.shiftCopy.phase.needsCrew", tone: "action" },
  crew_named: { labelKey: "work.shiftCopy.phase.crewNamed", tone: "info" },
  on_site: { labelKey: "work.shiftCopy.phase.onSite", tone: "info" },
  recorded: { labelKey: "work.shiftCopy.phase.recorded", tone: "info" },
  answered: { labelKey: "work.shiftCopy.phase.answered", tone: "info" },
  settled: { labelKey: "work.shiftCopy.phase.settled", tone: "success" },
};

/** Why a name came off the day. Client vocabulary — see `CREW_RELEASE_REASONS`. */
/** Catalogue keys; resolve with `t` at render time. */
export const RELEASE_REASON_LABEL: Record<CrewReleaseReason, string> = {
  substituted: "work.shiftCopy.release.substituted",
  unwell: "work.shiftCopy.release.unwell",
  did_not_report: "work.shiftCopy.release.didNotReport",
  reassigned: "work.shiftCopy.release.reassigned",
};

/** One line under a greyed roster row. */
/** Catalogue keys; resolve with `t` at render time. */
export const INELIGIBILITY_WORDING: Record<CrewIneligibility, string> = {
  archived: "work.shiftCopy.ineligible.archived",
  unverified: "work.shiftCopy.ineligible.unverified",
};

export function describeSelectionProblem(
  problem: CrewSelectionProblem,
  headcount: number | null,
  t: ReturnType<typeof useT>,
): string {
  switch (problem) {
    case "no_eligible_crew":
      return t("work.shiftCopy.selection.noEligible");
    case "empty":
      return t("work.shiftCopy.selection.empty");
    case "over_headcount":
      return headcount === null
        ? t("work.shiftCopy.selection.overUnknown")
        : t("work.shiftCopy.selection.over", { headcount });
  }
}

/** Catalogue keys; resolve with `t` at render time. */
export const SEVERITY_LABEL: Record<ShiftSafetySeverity, string> = {
  CRITICAL: "work.shiftCopy.severity.critical",
  SERIOUS: "work.shiftCopy.severity.serious",
  MINOR: "work.shiftCopy.severity.minor",
  NEAR_MISS: "work.shiftCopy.severity.nearMiss",
};

/** The four kinds the problem sheet offers; the rest of the enum stays reachable through support. */
/** `labelKey` is a catalogue key; resolve with `t` at render time. */
export const SAFETY_KIND_TILES: readonly { readonly value: ShiftSafetyCategory; readonly labelKey: string }[] = [
  { value: "injury", labelKey: "work.shiftCopy.safetyKind.injury" },
  { value: "unsafe-site", labelKey: "work.shiftCopy.safetyKind.unsafeSite" },
  { value: "equipment-failure", labelKey: "work.shiftCopy.safetyKind.equipment" },
  { value: "other", labelKey: "work.shiftCopy.safetyKind.other" },
];

/** Catalogue keys; resolve with `t` at render time. */
export const NO_SHOW_REASON_LABEL: Record<PartnerCrewNoShowReason, string> = {
  customer_no_show: "work.shiftCopy.noShow.customerNoShow",
  gate_locked: "work.shiftCopy.noShow.gateLocked",
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
  t: ReturnType<typeof useT>,
): { readonly label: string; readonly tone: Tone } {
  switch (claim) {
    case "no_amount":
      return { label: t("work.shiftCopy.settlement.noAmount"), tone: "neutral" };
    case "awaiting_both":
      return { label: t("work.shiftCopy.settlement.collectToday"), tone: "action" };
    case "supervisor_only":
      return {
        label: t("work.shiftCopy.settlement.waitingFor", { name: customerFirstName }),
        tone: "warning",
      };
    case "customer_only":
      return {
        label: t("work.shiftCopy.settlement.customerSaysPaid", { name: customerFirstName }),
        tone: "action",
      };
    case "settled":
      return { label: t("work.shiftCopy.settlement.paid"), tone: "success" };
  }
}

/** The one line under the settlement buttons (catalogue key). */
export const SETTLEMENT_STAYS_OPEN = "work.shiftCopy.settlementStaysOpen";

/** Day 1 only, under "We've reached" (catalogue key). */
export const DAY_ONE_EARNS_FEE = "work.shiftCopy.dayOneEarnsFee";

/** After a safety report is filed (catalogue key). */
export const SAFETY_LOGGED = "work.shiftCopy.safetyLogged";

/** The honest line where a cancel button would be (catalogue key). */
export const CALL_SUPPORT_TO_CANCEL = "work.shiftCopy.callSupportToCancel";

/** The customer's first name, or a neutral fallback when the contact is not released yet. */
export function customerFirstName(name: string | null | undefined, t: ReturnType<typeof useT>): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first === "" ? t("work.shiftCopy.theCustomer") : first;
}
