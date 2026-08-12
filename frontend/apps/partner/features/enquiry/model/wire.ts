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
  readonly categorySlug: string;
  /** The server's archetype for this record. Decides which composer opens. */
  readonly archetype: string;
  readonly status: EnquiryStatus;
  readonly requestedStart: string | null;
  readonly serviceBy: string | null;
  readonly respondsBy: string | null;
  readonly language: string;
  readonly createdAt: string;
}

export interface EnquiryRecord extends EnquiryRow {
  readonly answers: AnswerMap;
  readonly additionalDetails: string;
  readonly budgetMinPaise: number | null;
  readonly budgetMaxPaise: number | null;
  readonly declineReasonCode: string;
  readonly questions: readonly Schemas["RequirementQuestion"][];
  readonly siteVisits: readonly Schemas["SiteVisit"][];
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
    categorySlug: summary.category_slug,
    archetype: summary.archetype,
    status: summary.status,
    requestedStart: nullableInstant(summary.requested_start),
    serviceBy: nullableInstant(summary.service_by),
    respondsBy: nullableInstant(summary.responds_by),
    language: summary.language,
    createdAt: summary.created_at,
  };
}

export function readEnquiryRecord(detail: Schemas["EnquiryDetail"]): EnquiryRecord {
  return {
    ...readEnquiryRow(detail),
    answers: readAnswers(detail.answers),
    additionalDetails: detail.additional_details,
    budgetMinPaise: detail.budget_min_paise,
    budgetMaxPaise: detail.budget_max_paise,
    declineReasonCode: detail.decline_reason_code,
    questions: detail.questions,
    siteVisits: detail.site_visits,
  };
}
