import type { Schemas } from "@vsolve/api-client";

/**
 * What a Partner may do with one enquiry, and what its status means.
 *
 * Closes the decision half of `M2-FE-303` and `M2-FE-304`. Pure and
 * server-derived: every rule below mirrors a guard that already exists in
 * `apps/requirements/matching.py` or `apps/requirements/proposals.py`, so this
 * module decides what to *offer*, never what is *allowed*. Django refuses
 * independently and its refusal is the truth.
 *
 * ## Why the client holds a copy of the rules at all
 *
 * Because the alternative is offering every control on every enquiry and
 * letting the server say no. A Partner who taps Accept on an enquiry they
 * already declined has been told the app is broken, not that the enquiry moved.
 * The copy is small, it is named after the guard it mirrors, and it is only ever
 * allowed to *narrow* what is offered — a control this module hides can never be
 * a control Django would have allowed to matter.
 */

export type EnquiryStatus = Schemas["VendorInvitationStatusEnum"];

/**
 * The commands a screen may offer against an enquiry in this status.
 *
 * `canQuote` is separate from `canAccept` because they are separate slots in the
 * lifecycle: acceptance takes the quote slot and the capacity hold, quoting
 * fills it. A vendor who accepted yesterday and is quoting today is the ordinary
 * path, not a resumption.
 */
export interface EnquiryPermissions {
  /** `matching.accept_invitation` moves INVITED only. */
  readonly canAccept: boolean;
  /**
   * `matching.decline_invitation` refuses a QUOTED invitation outright —
   * "Withdraw the quote instead of declining." Offering Decline there is
   * offering a button whose only outcome is that refusal.
   */
  readonly canDecline: boolean;
  /** `proposals.submit_proposal` requires ACCEPTED or QUOTED. */
  readonly canQuote: boolean;
  /**
   * A question is refused only when the *requirement* is closed, which no
   * Partner-facing read publishes. So this narrows on the one thing that is
   * readable: an invitation the vendor has left or lost cannot be clarified.
   */
  readonly canAsk: boolean;
  /**
   * `proposals.request_site_visit` has no status guard at all. Offered only
   * where it has a purpose — before the quote is in — rather than everywhere the
   * server would tolerate it.
   */
  readonly canRequestSiteVisit: boolean;
}

/** Statuses where this vendor is out: nothing they do changes the enquiry. */
const CLOSED_TO_VENDOR: readonly EnquiryStatus[] = ["DECLINED", "EXPIRED", "WITHDRAWN"];

export function isEnquiryClosed(status: EnquiryStatus): boolean {
  return CLOSED_TO_VENDOR.includes(status);
}

export function permissionsFor(status: EnquiryStatus): EnquiryPermissions {
  const closed = isEnquiryClosed(status);

  return {
    canAccept: status === "INVITED",
    canDecline: status === "INVITED" || status === "ACCEPTED",
    canQuote: status === "ACCEPTED" || status === "QUOTED",
    canAsk: !closed,
    canRequestSiteVisit: !closed && status !== "QUOTED",
  };
}

/* ---------------------------------------------------------------------------
   Presentation
   --------------------------------------------------------------------------- */

export type EnquiryTone = "action" | "progress" | "settled" | "gone";

export interface EnquiryStatusCopy {
  /** The badge. Names the vendor's position, not the database value. */
  readonly label: string;
  readonly tone: EnquiryTone;
  /** One sentence: what this state means and what moves it. Never a promise. */
  readonly meaning: string;
}

/**
 * The six statuses in the vendor's own words.
 *
 * `EXPIRED` and `WITHDRAWN` are deliberately different sentences. An expiry is
 * the vendor running out of time; a withdrawal is the platform pulling the
 * enquiry back because the requirement changed under them, and it carries no
 * penalty. Collapsing them into "no longer available" would tell a vendor they
 * were too slow when they were not.
 */
const STATUS_COPY: Record<EnquiryStatus, EnquiryStatusCopy> = {
  INVITED: {
    label: "Waiting for you",
    tone: "action",
    meaning: "Accept to take one of this customer's quote slots, or decline so someone else can.",
  },
  ACCEPTED: {
    label: "You accepted",
    tone: "progress",
    meaning: "You hold a quote slot and your availability is held for these dates. Send your quote next.",
  },
  QUOTED: {
    label: "You quoted",
    tone: "progress",
    meaning: "Your quote is with the customer. You can send a revised quote, which replaces it.",
  },
  DECLINED: {
    label: "You declined",
    tone: "settled",
    meaning: "Your slot was released for another vendor. Nothing further is expected from you.",
  },
  EXPIRED: {
    label: "Time ran out",
    tone: "gone",
    meaning: "The response window closed before you answered, and the slot went back to the pool.",
  },
  WITHDRAWN: {
    label: "Pulled back",
    tone: "gone",
    meaning: "Vsolve withdrew this enquiry, usually because the request changed. This does not count against you.",
  },
};

export function describeStatus(status: EnquiryStatus): EnquiryStatusCopy {
  return STATUS_COPY[status];
}

/* ---------------------------------------------------------------------------
   Buckets
   --------------------------------------------------------------------------- */

export type EnquiryBucket = "needs_response" | "accepted" | "quoted" | "closed";

export function bucketOf(status: EnquiryStatus): EnquiryBucket {
  if (status === "INVITED") return "needs_response";
  if (status === "ACCEPTED") return "accepted";
  if (status === "QUOTED") return "quoted";
  return "closed";
}

export interface BucketCopy {
  readonly key: EnquiryBucket;
  readonly title: string;
  /** Shown when this bucket alone is empty and others are not. */
  readonly emptyLine: string;
}

/**
 * Reading order, fixed.
 *
 * Newest-first inside a bucket comes from the server (`-created_at`); the
 * buckets themselves never reorder, so a Partner who learns where "Waiting for
 * you" sits finds it in the same place tomorrow.
 */
export const BUCKET_ORDER: readonly BucketCopy[] = [
  {
    key: "needs_response",
    title: "Waiting for you",
    emptyLine: "Nothing is waiting on an answer right now.",
  },
  {
    key: "accepted",
    title: "Accepted — quote next",
    emptyLine: "You have not accepted anything that still needs a quote.",
  },
  { key: "quoted", title: "Quoted", emptyLine: "You have no quotes with a customer yet." },
  { key: "closed", title: "Closed", emptyLine: "Nothing has closed yet." },
];

export function groupIntoBuckets<T extends { readonly status: EnquiryStatus }>(
  enquiries: readonly T[],
): Map<EnquiryBucket, T[]> {
  const grouped = new Map<EnquiryBucket, T[]>();
  for (const enquiry of enquiries) {
    const bucket = bucketOf(enquiry.status);
    const existing = grouped.get(bucket);
    if (existing) existing.push(enquiry);
    else grouped.set(bucket, [enquiry]);
  }
  return grouped;
}

/* ---------------------------------------------------------------------------
   Deadlines (M2-FE-304)
   --------------------------------------------------------------------------- */

/**
 * How a response deadline should read.
 *
 * The whole point of `M2-FE-304`: this is **guidance**. `none` is a real and
 * common answer — `matching._invitation_deadline` returns nothing when the
 * service area publishes no operating window or the configuration carries no
 * SLA, so a large share of live enquiries genuinely have no clock. Inventing one
 * would be inventing a promise.
 *
 * `passed` means our clock says the window closed. It never means the enquiry is
 * gone: the server expires invitations on its own schedule, in business hours,
 * and `status` is the only thing that knows. So `passed` stops the screen
 * *offering* an accept, and says the enquiry may already have moved on — it
 * never announces the expiry itself.
 */
export type DeadlineState = "none" | "open" | "closing" | "passed";

/** Under an hour reads as urgent. Above it, hours and days are just time. */
export const CLOSING_SOON_MS = 60 * 60 * 1000;

export function deadlineStateFor(input: {
  readonly respondsBy: string | null;
  readonly remainingMs: number | null;
}): DeadlineState {
  if (input.respondsBy === null || input.remainingMs === null) return "none";
  if (input.remainingMs <= 0) return "passed";
  return input.remainingMs <= CLOSING_SOON_MS ? "closing" : "open";
}

/**
 * The sentence beside the countdown.
 *
 * Business-hours deadlines are presented truthfully rather than as a raw
 * duration: `add_business_hours` computes `responds_by` inside the service
 * area's operating windows, so "6 hours left" across a Sunday is a lie a bare
 * countdown tells by itself. The instant is stated; the arithmetic is not
 * re-explained.
 */
export function describeDeadline(state: DeadlineState): string {
  switch (state) {
    case "none":
      return "This enquiry has no published response deadline. Answer early anyway — slots are taken in order.";
    case "open":
      return "Vsolve counts response time in your area's working hours, so this is later than a straight countdown.";
    case "closing":
      return "This is close to its deadline. Accepting now is the only way to keep the slot.";
    case "passed":
      return "By our clock the window has closed. Vsolve decides when an enquiry actually expires, so this may still be open — re-read before assuming anything.";
  }
}
