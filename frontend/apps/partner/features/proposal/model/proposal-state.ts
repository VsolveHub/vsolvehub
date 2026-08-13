import type { Schemas } from "@vsolve/api-client";

import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";

/**
 * The eight proposal states and what a vendor may do from each.
 *
 * Closes the decision half of `M2-FE-313`. Append-only throughout: nothing here
 * edits a submitted quote, because `submit_proposal` never edits one either — a
 * revision is a new row that marks the previous one `SUPERSEDED`, and the
 * customer keeps seeing what they were originally offered.
 *
 * ## The read that was missing now exists
 *
 * Until 1.24.0 there was **no list read for a Partner's own proposals**: submit,
 * read-by-id and withdraw, and nothing that answered "which proposal did I send
 * for this enquiry". The id lived only as long as the tab that submitted it, and
 * `resolveProposalView` had a third `unreadable` state for that fact.
 *
 * **1.24.0 publishes `GET /api/v1/proposals/?requirement=`** — a cursor page
 * scoped to the caller. `features/proposal/queries.ts › useMyProposals` mounts it
 * on `m2QueryKeys.proposals.mine`, which the frozen key factory has held for it
 * since Wave 0. So the record survives a refresh, a second device and a new
 * session, and `unreadable` is now reachable only when that read itself fails —
 * which is an honest degradation rather than a structural hole.
 *
 * ## `REJECTED`, `LAPSED` and `ACCEPTED` are three different stories
 *
 * They are the states a vendor is most likely to misread, so the copy separates
 * them deliberately:
 *
 * - **`REJECTED`** is the *Customer's* refusal. They read the quote and went
 *   elsewhere, or marked it non-responsive.
 * - **`LAPSED`** is this vendor's own exit *after being selected* — they declined
 *   the reconfirmation, or the reconfirmation clock ran out. The Customer's
 *   entitlement survives untouched and the next quote costs them nothing more.
 *   The contract is explicit that a lapse is never written as a rejection,
 *   because a vendor reading "the customer rejected you" against their own
 *   timeout is told the wrong story about their own standing.
 * - **`ACCEPTED`** is the vendor reconfirming after selection: price, date and
 *   capacity all re-checked and agreed. It is the state the engagement opens
 *   from, and it is the only genuinely won one.
 */

export type Proposal = Schemas["Proposal"];
export type ProposalStatus = Schemas["ProposalStatusEnum"];

export interface ProposalStatusCopy {
  readonly label: string;
  readonly tone: "progress" | "settled" | "gone" | "won";
  /** What this state means for the vendor, and what they may still do. */
  readonly meaning: string;
}

const STATUS_COPY: Record<ProposalStatus, ProposalStatusCopy> = {
  SUBMITTED: {
    label: "With the customer",
    tone: "progress",
    meaning:
      "This is the quote the customer sees. Sending a new one replaces it; withdrawing takes it off the table.",
  },
  SUPERSEDED: {
    label: "Replaced",
    tone: "settled",
    meaning:
      "You sent a newer quote. The customer can still see this one — quotes are never overwritten.",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    tone: "gone",
    meaning: "You took this quote off the table. The customer can no longer choose it.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "gone",
    meaning:
      "The validity date you set has passed, so this quote is no longer offered. Send a new one if you still want the work.",
  },
  SELECTED: {
    label: "Chosen — confirm it",
    tone: "won",
    meaning:
      "The customer chose this quote and is waiting for you to confirm the price, the dates and that you can still staff it. It is not a booking until you do.",
  },
  REJECTED: {
    label: "Not chosen",
    tone: "settled",
    // The Customer's own refusal, and named as theirs.
    meaning: "The customer read this quote and went with someone else.",
  },
  ACCEPTED: {
    label: "Confirmed",
    tone: "won",
    meaning:
      "You confirmed this quote after the customer chose it. The work opens from here — changes from this point are scope amendments, not new quotes.",
  },
  LAPSED: {
    label: "Lapsed after selection",
    tone: "gone",
    // Never "rejected". The customer wanted this quote; this vendor did not
    // confirm it in time or declined it. Saying otherwise misreports the
    // vendor's own standing back to them.
    meaning:
      "The customer had chosen this quote and it lapsed before you confirmed it — either you declined, or the confirmation window closed. That is not a rejection by the customer, and their fee stands, so they can go to the next quote at no extra cost.",
  },
};

export function describeProposalStatus(status: ProposalStatus): ProposalStatusCopy {
  return STATUS_COPY[status];
}

/**
 * Usability, in the vendor's terms.
 *
 * `OUT_OF_BUDGET` is a label rather than a rejection — `classify_usability`
 * keeps the quote visible and lets the customer decide — so it must not read as
 * a failure. `INCOMPLETE` is never produced by the current classifier; it is
 * handled because the enum publishes it and a screen that crashes on a value the
 * server can legally send is worse than one that renders it plainly.
 */
export function describeUsability(usability: Schemas["ProposalUsabilityEnum"]): string | null {
  switch (usability) {
    case "USABLE":
      return null;
    case "OUT_OF_BUDGET":
      return "Above the budget the customer stated. They can still choose it — Vsolve shows it labelled rather than hiding it.";
    case "INCOMPLETE":
      return "Vsolve has this quote marked incomplete, so it is not being shown as a usable option.";
  }
}

/**
 * A re-validation the customer asked for, or nothing.
 *
 * `revalidation_requested_at` (1.24.0) is the customer's one-tap "is this price
 * still good" against an expired quote. It costs them nothing and reuses the
 * unlock or plan they already paid for, and **only the vendor can answer it** —
 * by superseding. Left unsurfaced it would be an expired quote the vendor had no
 * reason to touch and a customer waiting on an answer nobody told them about.
 */
export function revalidationNoticeFor(proposal: Proposal): string | null {
  if (proposal.revalidation_requested_at === null) return null;
  return "The customer asked whether this price still stands. Send a revised quote to answer — it costs them nothing and it is the only way to say yes.";
}

export interface ProposalPermissions {
  /** `withdraw_proposal` moves SUBMITTED only. */
  readonly canWithdraw: boolean;
  /** A revision is a fresh submit, allowed while the enquiry still holds a slot. */
  readonly canSupersede: boolean;
}

/** States where the commercial conversation is over and a new row changes nothing. */
const SETTLED: readonly ProposalStatus[] = ["SELECTED", "ACCEPTED", "LAPSED"];

export function permissionsFor(input: {
  readonly proposal: Proposal;
  readonly enquiryStatus: EnquiryStatus;
}): ProposalPermissions {
  const slotHeld = input.enquiryStatus === "ACCEPTED" || input.enquiryStatus === "QUOTED";

  return {
    canWithdraw: input.proposal.status === "SUBMITTED",
    // Not from SELECTED or ACCEPTED: the customer has committed, and a
    // "revision" at that point is a scope amendment on an engagement, which is
    // Wave B3's spine. Not from LAPSED either — the selection has already moved
    // on to the next quote, and superseding a lapsed row would put a price back
    // in front of a customer who is no longer choosing.
    canSupersede: slotHeld && !SETTLED.includes(input.proposal.status),
  };
}

/* ---------------------------------------------------------------------------
   What the screen can actually show
   --------------------------------------------------------------------------- */

/**
 * The honest answers to "where is my quote".
 *
 * - `none` — the enquiry has no quote on it. Compose one.
 * - `known` — the server returned this vendor's own quote for this enquiry.
 * - `unreadable` — the enquiry says QUOTED and the proposal read failed or is
 *   still pending. Rare now that `GET /proposals/?requirement=` exists, and kept
 *   because a failed read must not silently render as "you have not quoted".
 */
export type ProposalView =
  | { readonly kind: "none" }
  | { readonly kind: "known"; readonly proposal: Proposal }
  | { readonly kind: "unreadable" };

export function resolveProposalView(input: {
  readonly enquiryStatus: EnquiryStatus;
  /** The record from the server read, or from this session's submit. */
  readonly proposal: Proposal | null;
}): ProposalView {
  if (input.proposal) return { kind: "known", proposal: input.proposal };
  if (input.enquiryStatus === "QUOTED") return { kind: "unreadable" };
  return { kind: "none" };
}

/**
 * The live quote for one enquiry, and the rows it superseded.
 *
 * `GET /proposals/?requirement=` returns every proposal this vendor sent against
 * the requirement, across every invitation and every revision. Two rules turn
 * that into what a screen shows:
 *
 *  1. **Scope to the invitation.** A vendor re-invited on a second wave has two
 *     invitations on one requirement, and one enquiry screen must not show the
 *     other's quote.
 *  2. **Highest revision wins, and nothing is dropped.** The current row is the
 *     one with the highest `revision`; the rest are the supersession trace and
 *     stay readable, because append-only is the whole point of the record.
 */
export interface ProposalTrace {
  /** The row a vendor is looking at now — highest revision. */
  readonly current: Proposal | null;
  /** Everything it replaced, newest first. Never edited, never hidden. */
  readonly superseded: readonly Proposal[];
}

export function traceForInvitation(input: {
  readonly proposals: readonly Proposal[];
  readonly invitationId: string;
}): ProposalTrace {
  const mine = input.proposals
    .filter((row) => row.invitation === input.invitationId)
    .slice()
    .sort((a, b) => b.revision - a.revision);

  if (mine.length === 0) return { current: null, superseded: [] };
  return { current: mine[0] ?? null, superseded: mine.slice(1) };
}

/** The sentence the `unreadable` state shows. Stated once, used by both composers. */
export const UNREADABLE_PROPOSAL_NOTICE =
  "You have already quoted on this enquiry and Vsolve could not load the quote itself just now. Nothing is lost — the customer still has it. Try again, or send a new quote, which replaces whatever is with them.";
