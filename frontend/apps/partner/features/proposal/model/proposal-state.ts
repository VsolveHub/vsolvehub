import type { Schemas } from "@vsolve/api-client";

import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";

/**
 * The six proposal states and what a vendor may do from each.
 *
 * Closes the decision half of `M2-FE-313`. Append-only throughout: nothing here
 * edits a submitted quote, because `submit_proposal` never edits one either — a
 * revision is a new row that marks the previous one `SUPERSEDED`, and the
 * customer keeps seeing what they were originally offered.
 *
 * ## The one state this build cannot read back
 *
 * There is **no list read for a Partner's own proposals**. Contract 1.21.0
 * publishes `POST /proposals/`, `GET /proposals/{id}/` and
 * `POST /proposals/{id}/withdraw/` — and nothing that answers "which proposal did
 * I send for this enquiry". `EnquiryDetail` carries `questions` and
 * `site_visits`; it does not carry proposals.
 *
 * So the id is only in hand for as long as the tab that submitted it lives.
 * After a refresh, on a second device, or in a new session, the only readable
 * truth is `VendorInvitation.status == "QUOTED"` — the enquiry knows a quote
 * exists and cannot say which. `resolveProposalView` below is that fact made
 * explicit rather than papered over: nothing is persisted locally to fake a read
 * the server does not offer, because a client-held id survives neither a second
 * device nor a cleared tab, and a screen that works on one machine and not the
 * next is worse than one that is honestly limited on both.
 *
 * Requested in `frontend-execution-plan.md` §7. `m2QueryKeys.proposals.mine`
 * already exists for it and stays unmounted until it lands — which is the rule
 * in `m2-keys.ts`, not a workaround.
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
    meaning: "This is the quote the customer sees. Sending a new one replaces it; withdrawing takes it off the table.",
  },
  SUPERSEDED: {
    label: "Replaced",
    tone: "settled",
    meaning: "You sent a newer quote. The customer can still see this one — quotes are never overwritten.",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    tone: "gone",
    meaning: "You took this quote off the table. The customer can no longer choose it.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "gone",
    meaning: "The validity date you set has passed, so this quote is no longer offered. Send a new one if you still want the work.",
  },
  SELECTED: {
    label: "Chosen",
    tone: "won",
    meaning: "The customer chose this quote. It cannot be changed or withdrawn from here.",
  },
  REJECTED: {
    label: "Not chosen",
    tone: "settled",
    meaning: "The customer went elsewhere on this one.",
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

export interface ProposalPermissions {
  /** `withdraw_proposal` moves SUBMITTED only. */
  readonly canWithdraw: boolean;
  /** A revision is a fresh submit, allowed while the enquiry still holds a slot. */
  readonly canSupersede: boolean;
}

export function permissionsFor(input: {
  readonly proposal: Proposal;
  readonly enquiryStatus: EnquiryStatus;
}): ProposalPermissions {
  const slotHeld = input.enquiryStatus === "ACCEPTED" || input.enquiryStatus === "QUOTED";

  return {
    canWithdraw: input.proposal.status === "SUBMITTED",
    // Not from SELECTED: the customer has committed, and a "revision" at that
    // point is a scope amendment on an engagement, which is Wave B3's spine.
    canSupersede: slotHeld && input.proposal.status !== "SELECTED",
  };
}

/* ---------------------------------------------------------------------------
   What the screen can actually show
   --------------------------------------------------------------------------- */

/**
 * The three honest answers to "where is my quote".
 *
 * - `none` — the enquiry has no quote on it. Compose one.
 * - `known` — this session submitted it and holds the record.
 * - `unreadable` — the enquiry says QUOTED and this build cannot fetch which
 *   proposal that is. The vendor is told plainly, and offered the one thing that
 *   still works: sending a revision, which supersedes whatever is there.
 */
export type ProposalView =
  | { readonly kind: "none" }
  | { readonly kind: "known"; readonly proposal: Proposal }
  | { readonly kind: "unreadable" };

export function resolveProposalView(input: {
  readonly enquiryStatus: EnquiryStatus;
  /** The record from this session's submit or read, if there is one. */
  readonly proposal: Proposal | null;
}): ProposalView {
  if (input.proposal) return { kind: "known", proposal: input.proposal };
  if (input.enquiryStatus === "QUOTED") return { kind: "unreadable" };
  return { kind: "none" };
}

/** The sentence the `unreadable` state shows. Stated once, used by both composers. */
export const UNREADABLE_PROPOSAL_NOTICE =
  "You have already quoted on this enquiry. Vsolve cannot show you the quote itself yet — there is no way for this app to read a quote back after you close it. Sending a new one replaces whatever is with the customer.";
