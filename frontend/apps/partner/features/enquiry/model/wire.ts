import type { Schemas } from "@vsolve/api-client";

import { readAnswers, type AnswerMap } from "./requirement-facts";
import type { EnquiryStatus } from "./enquiry-state";

/**
 * The one place that knows the enquiry contract is wrong about nullability.
 *
 * Contract 1.21.0 declares `requested_start`, `service_by` and `responds_by` as
 * required, non-null strings on `EnquirySummary` and `EnquiryDetail`. All three
 * are nullable where they are actually stored:
 *
 * | Field | Where it comes from | Null when |
 * |---|---|---|
 * | `requested_start` | `RequirementSnapshot.requested_start` (`null=True`) | the customer gave no start date |
 * | `service_by` | `RequirementSnapshot.service_by` (`null=True`) | the customer gave no hard deadline |
 * | `responds_by` | `VendorInvitation.responds_by` (`null=True`) | `matching._invitation_deadline` returns nothing — no operating window, or no SLA hours on the variant configuration |
 *
 * None of those are edge cases. A requirement without a hard needed-by date is
 * ordinary, and an invitation with no published deadline is what every service
 * area without operating windows produces.
 *
 * Reading them as `string` and formatting them straight would print
 * `Invalid Date` into a live enquiry. Sprinkling `?? null` at each use site would
 * work and would also scatter the knowledge that the contract is wrong across a
 * dozen files, so when it is corrected nobody can find the compensations. They
 * are here, in one adapter, and the correction is requested in
 * `frontend-execution-plan.md` §7. When the contract publishes them nullable,
 * this file's casts go and its shape stays.
 */

export interface EnquiryRow {
  readonly id: string;
  readonly requirementId: string;
  /**
   * The catalogue's own name for the service.
   *
   * Landed on `EnquiryDetail` at 1.24.0 and on `EnquirySummary` at **1.26.0**,
   * which is what moved it up here from `EnquiryRecord`. Until then the inbox
   * row titled itself by de-slugging `category_slug` — which is
   * `variant.service.slug`, a routing key rather than a name, and misnamed
   * besides. Declared non-null on both projections (`variant.service.name` is a
   * required column), so there is no nullable case to handle; a blank one is
   * still said plainly rather than rendered as an empty heading.
   *
   * `category_slug` is deliberately **not** projected any more. Nothing may read
   * it: it is a routing key, and the only thing this app ever did with it was
   * format it into a title.
   */
  readonly serviceName: string;
  /** Locality-level location only. Never a street, building or coordinate. */
  readonly approximateArea: string;
  /** The server's archetype for this record. Decides which composer opens. */
  readonly archetype: string;
  readonly status: EnquiryStatus;
  readonly requestedStart: string | null;
  readonly serviceBy: string | null;
  readonly respondsBy: string | null;
  readonly createdAt: string;
}

export interface EnquiryRecord extends EnquiryRow {
  readonly answers: AnswerMap;
  /**
   * The visit the customer already chose, published from contract 1.44.0.
   *
   * Null until they pick one. The partner never sets these — BE-2 moved the
   * choice to the customer, and the slot-selection endpoints this app used to
   * call were removed in the same release.
   */
  readonly fixedVisitStart: string | null;
  readonly fixedVisitDurationMinutes: number | null;
  readonly fixedVisitEarningPaise: number | null;
  readonly fixedVisitStatus: string | null;
  readonly budgetMinPaise: number | null;
  readonly budgetMaxPaise: number | null;
  /**
   * The basis every quote on this requirement is compared on, or blank (1.24.0).
   *
   * `_required_tax_basis` forces every quote onto whichever basis the first
   * vendor used and refuses a mismatch — previously against a vendor the second
   * one could not see. Blank means no vendor has fixed it yet and **this vendor
   * sets it**; a value means it is already decided and choosing the other one
   * earns a refusal.
   */
  readonly requiredTaxBasis: string;
  readonly declineReasonCode: string;
  readonly questions: readonly Schemas["RequirementQuestion"][];
  readonly siteVisits: readonly Schemas["SiteVisit"][];
  /** Exact visit destination, released only once a paid visit is scheduled. */
  readonly siteAddress: Schemas["PartnerSiteAddress"] | null;
  /**
   * The server's own clock at the moment this enquiry was read (1.24.0).
   *
   * The `responds_by` countdown is measured against this, not against the
   * device. `@vsolve/api-client`'s `unwrap` feeds any `server_now` in a response
   * body straight into `serverClock` at millisecond precision, which outranks
   * the `Date` header's one-second granularity — so every countdown on this
   * screen is calibrated by the act of reading it. Kept on the record as well
   * because "as of when" is a thing a screen can legitimately show.
   */
  readonly serverNow: string;
}

/** A declared-required string that the database allows to be null. */
function nullableInstant(value: string): string | null {
  // The cast is the whole point of the file: the declared type says this cannot
  // happen and the migration says it can.
  const raw = value as string | null | undefined;
  return raw === null || raw === undefined || raw === "" ? null : raw;
}

export function readEnquiryRow(summary: Schemas["EnquirySummary"]): EnquiryRow {
  return {
    id: summary.id,
    requirementId: summary.requirement_id,
    serviceName: summary.service_name,
    approximateArea: summary.approximate_area,
    archetype: summary.archetype,
    status: summary.status,
    requestedStart: nullableInstant(summary.requested_start),
    serviceBy: nullableInstant(summary.service_by),
    respondsBy: nullableInstant(summary.responds_by),
    createdAt: summary.created_at,
  };
}

export function readEnquiryRecord(detail: Schemas["EnquiryDetail"]): EnquiryRecord {
  return {
    ...readEnquiryRow(detail),
    answers: readAnswers(detail.answers),
    fixedVisitStart: detail.fixed_visit_start,
    fixedVisitDurationMinutes: detail.fixed_visit_duration_minutes,
    fixedVisitEarningPaise: detail.fixed_visit_earning_paise,
    fixedVisitStatus: detail.fixed_visit_status,
    budgetMinPaise: detail.budget_min_paise,
    budgetMaxPaise: detail.budget_max_paise,
    requiredTaxBasis: detail.required_tax_basis,
    declineReasonCode: detail.decline_reason_code,
    questions: detail.questions,
    siteVisits: detail.site_visits,
    siteAddress: detail.site_address,
    serverNow: detail.server_now,
  };
}

/* ---------------------------------------------------------------------------
   Site visits
   --------------------------------------------------------------------------- */

/**
 * The A5 plan visit on this enquiry, or nothing.
 *
 * `is_plan_visit` is published (1.24.0) precisely so a client does not infer it
 * from `fee_paise`. A plan visit is paid out of the Customer's visit plan,
 * occupies one of its shares and opens the post-visit estimate window when it
 * completes; an ad-hoc visit is a vendor-priced journey with none of that behind
 * it. Rendering the two as one thing with a different price is the mistake the
 * flag exists to prevent.
 *
 * At most one plan visit exists per invitation — one vendor takes one share — so
 * the newest is returned when the server sends more than one, which it does
 * after a cancelled slot is rebooked.
 */
export function planVisitOf(
  visits: readonly Schemas["SiteVisit"][],
): Schemas["SiteVisit"] | null {
  const plan = visits.filter((visit) => visit.is_plan_visit);
  if (plan.length === 0) return null;
  // Later `scheduled_for` wins; a visit with no time yet sorts last, because a
  // held slot awaiting the Customer's payment is not the one to estimate on.
  return (
    plan
      .slice()
      .sort((a, b) => (b.scheduled_for ?? "").localeCompare(a.scheduled_for ?? ""))[0] ?? null
  );
}

/** Visit statuses from which no further vendor action is possible. */
const VISIT_CLOSED: readonly Schemas["SiteVisitStatusEnum"][] = [
  "CANCELLED",
  "VENDOR_NO_SHOW",
  "CUSTOMER_NO_SHOW",
];

export function isVisitClosed(status: Schemas["SiteVisitStatusEnum"]): boolean {
  return VISIT_CLOSED.includes(status);
}
