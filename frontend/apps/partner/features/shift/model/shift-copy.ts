import type {
  CrewIneligibility,
  CrewReleaseReason,
  CrewSelectionProblem,
  ShiftDayPhase,
  ShiftSafetyCategory,
  ShiftSafetySeverity,
  ShiftSettlementClaim,
} from "@vsolve/query";

import type { PartnerCrewNoShowReason } from "../queries";

/**
 * Every word the shift-day screens say, in one file.
 *
 * The same split `engagement-copy.ts` makes: `@vsolve/query` decides what is
 * *true* about a day, this decides how it is *said*. Keeping them apart is what
 * lets the rules be read against `07-state-machines-and-permissions.md` without
 * a paragraph of UI copy between each one.
 *
 * ## Three sentences this file exists to get right
 *
 * 1. **The platform never holds the wages.** Every string that touches money
 *    says who pays whom. A supervisor who reads "settled" as "Vsolve has paid
 *    me" has been misled by their own app, and there is no screen in this
 *    milestone where Vsolve pays an A3 wage.
 * 2. **Non-OTP arrival is the normal path.** Not a fallback, not degraded, and
 *    no copy here apologises for it. The start OTP is M3.
 * 3. **A safety report is a record, never a cancellation.** The safety copy says
 *    what the report does *and* what it does not do, because the thing it does
 *    not do is what a supervisor standing beside an injured worker most needs to
 *    know.
 */

export interface PhaseWording {
  readonly label: string;
  readonly tone: "action" | "info" | "neutral" | "warning" | "success";
  readonly sentence: string;
}

export const PHASE_WORDING: Record<ShiftDayPhase, PhaseWording> = {
  needs_crew: {
    label: "Nobody named yet",
    tone: "action",
    sentence:
      "Say who is going before anything else can happen on this day. The customer sees the names, and nobody can confirm an arrival for people who have not been named.",
  },
  crew_named: {
    label: "Crew named",
    tone: "info",
    sentence:
      "Your crew is on the record for this day. Confirm they arrived once they are on site.",
  },
  on_site: {
    label: "On site",
    tone: "info",
    sentence:
      "Arrival is recorded and the day is running. Close it this evening by saying how many of your crew were there.",
  },
  recorded: {
    label: "Sent to the customer",
    tone: "info",
    sentence:
      "You have recorded the day. The customer confirms or disputes the count from their side.",
  },
  answered: {
    label: "Customer answered",
    tone: "info",
    sentence: "The customer has answered your count for this day.",
  },
  settled: {
    label: "Settled",
    tone: "success",
    sentence:
      "You and the customer have both said this day was settled. The amount below is frozen at what it was when you both agreed.",
  },
};

/** Why a name came off the day. Client vocabulary — see `CREW_RELEASE_REASONS`. */
export const RELEASE_REASON_LABEL: Record<CrewReleaseReason, string> = {
  substituted: "Somebody else is going instead",
  unwell: "They are unwell",
  did_not_report: "They did not report for the shift",
  reassigned: "I moved them to another job",
};

export const INELIGIBILITY_WORDING: Record<CrewIneligibility, string> = {
  archived: "Off your roster. Add them back from Crew before putting them on a shift.",
  unverified:
    "Not verified yet. Vsolve checks a worker's documents before they can be named on a shift — until then they cannot be assigned, even by you.",
};

export function describeSelectionProblem(
  problem: CrewSelectionProblem,
  headcount: number | null,
): string {
  switch (problem) {
    case "no_eligible_crew":
      return "Nobody on your roster can be put on a shift yet. Add a worker, or wait for Vsolve to verify the ones you have added.";
    case "empty":
      return "Tick at least one person. This sends the whole crew for the day, so an empty list would take everybody off it.";
    case "over_headcount":
      return headcount === null
        ? "That is more people than this day was booked for. Extra workers are a change request at the published rate."
        : `This day was booked for ${headcount} ${headcount === 1 ? "worker" : "workers"}. Sending more is a change request at the published rate, not a longer list here.`;
  }
}

export const SEVERITY_LABEL: Record<ShiftSafetySeverity, string> = {
  CRITICAL: "Critical — life-threatening or fatal",
  SERIOUS: "Serious injury or damage",
  MINOR: "Minor injury or damage",
  NEAR_MISS: "A near miss — nobody was hurt",
};

export const SAFETY_CATEGORY_LABEL: Record<ShiftSafetyCategory, string> = {
  injury: "Somebody was injured",
  "near-miss": "Something nearly went wrong",
  "unsafe-site": "The site itself is unsafe",
  "equipment-failure": "Equipment failed or was unsafe",
  electrical: "Electrical hazard",
  "fall-from-height": "A fall, or a risk of falling",
  other: "Something else",
};

export const NO_SHOW_REASON_LABEL: Record<PartnerCrewNoShowReason, string> = {
  customer_no_show: "Nobody was there to let us in or brief us",
  gate_locked: "The gate or the site was locked",
};

/**
 * What the settlement record currently proves, said in the vendor's own terms.
 *
 * `supervisor_only` is the one that has to be worded carefully. It is neither
 * "you have been paid" nor "you have not been paid" — it is one person's word,
 * standing unanswered, and Operations reads it as unproven. Saying anything
 * stronger would make the trail evidence of nothing in the one argument it
 * exists for.
 */
export const SETTLEMENT_WORDING: Record<
  ShiftSettlementClaim,
  { readonly label: string; readonly tone: PhaseWording["tone"]; readonly sentence: string }
> = {
  no_amount: {
    label: "No amount yet",
    tone: "neutral",
    sentence:
      "Record how many of your crew were here first. Until somebody says who was on site there is no figure to settle.",
  },
  awaiting_both: {
    label: "Neither of you has confirmed",
    tone: "action",
    sentence:
      "The customer pays your crew directly. Once they have, tap below and ask them to do the same — two taps is what makes it a settled day on the record.",
  },
  supervisor_only: {
    label: "Waiting on the customer",
    tone: "warning",
    sentence:
      "You have said this day was settled and the customer has not answered. Vsolve records that as unproven, not as paid — it is your word standing on its own until they tap too.",
  },
  customer_only: {
    label: "Waiting on you",
    tone: "action",
    sentence:
      "The customer says they have settled this day. If that matches what you received, tap below. If it does not, do not tap — contact support instead.",
  },
  settled: {
    label: "Settled",
    tone: "success",
    sentence:
      "You both agreed this day was settled. The amount is frozen at what it was at that moment.",
  },
};

/**
 * The sentence that has to appear wherever the settlement figure does.
 *
 * ADR-0009: wages are direct, daily and peer-to-peer, and no endpoint in this
 * milestone may move wage money. This screen carries the only large number a
 * lead sees at the end of a day, and a number on a platform screen reads as a
 * number the platform is holding unless it says otherwise.
 */
export const WAGES_ARE_DIRECT =
  "Vsolve does not hold or pay these wages. The customer pays your crew directly at the end of the day, the way they always have — this screen records what was agreed, nothing more.";

/**
 * Arrival, stated as the ordinary path it is.
 *
 * `M2-FE-504` and the contract both say non-OTP is the default in M2 rather than
 * a degraded fallback, so there is no "we could not verify with a code" anywhere
 * in this copy.
 */
export const ARRIVAL_IS_A_PERSONS_WORD =
  "Either you or the customer can record this — you were both there. Vsolve takes the word of whoever taps first and stamps the time.";

/** What filing a safety report does, and the two things it does not do. */
export const SAFETY_IS_NOT_A_CANCELLATION =
  "This is a record, not a cancellation. Filing it does not stop the job, does not suspend anybody and does not move any money — it goes to Vsolve's safety team and stays on this booking permanently. If the work has to stop as well, that is a separate conversation with support.";
