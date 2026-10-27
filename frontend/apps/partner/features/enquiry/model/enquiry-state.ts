import type { Schemas } from "@vsolve/api-client";
import type { useT } from "@vsolve/ui";

type T = ReturnType<typeof useT>;

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
 * the vendor running out of time; a withdrawal is the platform releasing the
 * enquiry, and it carries no penalty. Collapsing them into "no longer
 * available" would tell a vendor they were too slow when they were not.
 *
 * `WITHDRAWN` alone is not a sentence yet — see `WITHDRAWN_REASON_COPY`.
 *
 * `label` and `meaning` hold catalogue keys; `describeStatus` resolves them.
 */
const STATUS_COPY: Record<EnquiryStatus, EnquiryStatusCopy> = {
  INVITED: {
    label: "enquiry.status.invited.label",
    tone: "action",
    meaning: "enquiry.status.invited.meaning",
  },
  ACCEPTED: {
    label: "enquiry.status.accepted.label",
    tone: "progress",
    meaning: "enquiry.status.accepted.meaning",
  },
  QUOTED: {
    label: "enquiry.status.quoted.label",
    tone: "progress",
    meaning: "enquiry.status.quoted.meaning",
  },
  DECLINED: {
    label: "enquiry.status.declined.label",
    tone: "settled",
    meaning: "enquiry.status.declined.meaning",
  },
  EXPIRED: {
    label: "enquiry.status.expired.label",
    tone: "gone",
    meaning: "enquiry.status.expired.meaning",
  },
  WITHDRAWN: {
    label: "enquiry.status.withdrawn.label",
    tone: "gone",
    meaning: "enquiry.status.withdrawn.meaning",
  },
};

/**
 * Why a withdrawal happened, in the vendor's words.
 *
 * ## The sentence this replaces was false
 *
 * `WITHDRAWN` used to read "Vsolve withdrew this enquiry, **usually because
 * the request changed**". Across every withdrawal on the platform the stored
 * `decline_reason_code` was `slot_taken` (18), `offer_taken` (6) or
 * `non_responsive_quote` (1) — and `requirement_changed` **zero times**. The
 * copy named the one case that has never occurred and omitted the only ones
 * that have, so a professional who simply came second in a race was told the
 * customer had changed their mind. That reads as the platform pulling work out
 * from under them, and it is the opposite of what happened.
 *
 * The server has always recorded the real reason, the API has always published
 * it, and `wire.ts` has always mapped it — it just never reached a screen.
 *
 * ## Two rules hold for every sentence here
 *
 * Every one ends by saying the withdrawal does not count against the vendor,
 * because none of these are faults — losing a race is not a performance
 * problem. And an unknown code falls back to the generic sentence rather than
 * guessing: a reason this bundle has no words for is better left unexplained
 * than explained wrongly, which is the whole defect being fixed here.
 */
const WITHDRAWN_REASON_COPY: Record<string, string> = {
  slot_taken: "enquiry.withdrawnReason.slotTaken",
  offer_taken: "enquiry.withdrawnReason.offerTaken",
  non_responsive_quote: "enquiry.withdrawnReason.nonResponsiveQuote",
  requirement_changed: "enquiry.withdrawnReason.requirementChanged",
};

/**
 * The vendor-facing copy for one enquiry state.
 *
 * `declineReasonCode` is read only on `WITHDRAWN`, where it is the difference
 * between "you lost a race" and "the customer changed their mind". It is
 * ignored everywhere else: the other five statuses already say what happened,
 * and a reason code left over on one of them must not rewrite them.
 */
export function describeStatus(
  status: EnquiryStatus,
  t: T,
  declineReasonCode?: string,
): EnquiryStatusCopy {
  const keys = STATUS_COPY[status];
  const copy = { ...keys, label: t(keys.label), meaning: t(keys.meaning) };
  if (status !== "WITHDRAWN" || declineReasonCode === undefined) return copy;
  const reason = WITHDRAWN_REASON_COPY[declineReasonCode.trim()];
  return reason === undefined ? copy : { ...copy, meaning: t(reason) };
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
 *
 * `title` and `emptyLine` are catalogue keys, resolved with `t` at render time.
 */
export const BUCKET_ORDER: readonly BucketCopy[] = [
  {
    key: "needs_response",
    title: "enquiry.bucket.needsResponse.title",
    emptyLine: "enquiry.bucket.needsResponse.empty",
  },
  {
    key: "accepted",
    title: "enquiry.bucket.accepted.title",
    emptyLine: "enquiry.bucket.accepted.empty",
  },
  { key: "quoted", title: "enquiry.bucket.quoted.title", emptyLine: "enquiry.bucket.quoted.empty" },
  { key: "closed", title: "enquiry.bucket.closed.title", emptyLine: "enquiry.bucket.closed.empty" },
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
export function describeDeadline(state: DeadlineState, t: T): string {
  switch (state) {
    case "none":
      return t("enquiry.deadline.none");
    case "open":
      return t("enquiry.deadline.open");
    case "closing":
      return t("enquiry.deadline.closing");
    case "passed":
      return t("enquiry.deadline.passed");
  }
}
