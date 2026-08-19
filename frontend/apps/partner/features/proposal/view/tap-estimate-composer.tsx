"use client";

import { describeError } from "@vsolve/query";
import { Card, ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { isVisitNotCompleted } from "@/features/visit/queries";
import type { SiteVisit } from "@/features/visit/model/visit-state";

import { toOnsiteRequest } from "../model/onsite-draft";
import type { TaxBasis } from "../model/proposal-draft";
import { toOnsiteDraft, type TapEstimate as TapEstimateDraft } from "../model/tap-estimate";
import { useSubmitProposal, type Proposal } from "../queries";
import { TapEstimate } from "./tap-estimate";

/**
 * The tap-only estimate, wired to the submit that already works.
 *
 * ## Why this is a thin adapter
 *
 * `TapEstimate` holds no queries and knows no endpoint, and this file holds no
 * layout. The conversion is two calls — `toOnsiteDraft` produces the draft the
 * typed composer produced, `toOnsiteRequest` turns that into the request the
 * server already validates — so the tap flow cannot send a shape the typed one
 * could not, and cannot skip a rule it enforced.
 *
 * ## The completed-visit guard stays enabled
 *
 * An A5 estimate may only be submitted against a `COMPLETED` visit and
 * `m2_visit_not_completed` is the refusal, but this screen's copy of that fact
 * can be a minute old — the vendor may have closed the visit in another tab, or
 * the customer may have. Disabling on a stale read is a dead button, so the
 * state is explained above the controls and the server's own refusal is routed
 * to the same explanation. That reasoning is inherited from the composer this
 * replaces and is deliberately unchanged.
 */

export interface TapEstimateComposerProps {
  readonly enquiry: EnquiryRecord;
  readonly visit: SiteVisit | null;
  readonly enquiryHref: string;
  readonly supersedesRevision: number;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function TapEstimateComposer({
  enquiry,
  visit,
  enquiryHref,
  supersedesRevision,
  onSubmitted,
}: TapEstimateComposerProps) {
  const submit = useSubmitProposal();

  const visitIsOpen = visit !== null && visit.status !== "COMPLETED";
  const refusedForVisit = isVisitNotCompleted(submit.error);
  const presentation =
    submit.error && !refusedForVisit ? describeError(submit.error, "mutation") : null;

  function handleSend(estimate: TapEstimateDraft): void {
    if (visit === null || submit.isPending) return;
    submit.mutate(
      {
        body: toOnsiteRequest({
          invitationId: enquiry.id,
          siteVisitId: visit.id,
          draft: toOnsiteDraft(estimate),
        }),
        supersedesRevision,
        requirementId: enquiry.requirementId,
        invitationId: enquiry.id,
      },
      { onSuccess: onSubmitted },
    );
  }

  if (visit === null) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold text-text">No visit on this job yet</h2>
        <p className="text-sm leading-6 text-text-secondary">
          A project estimate is written after you have been to see the work. Take a visit slot
          from the enquiry first.
        </p>
        <Link href={enquiryHref} className={buttonStyles({ variant: "primary" })}>
          Back to the enquiry
        </Link>
      </Card>
    );
  }

  return (
    <TapEstimate
      archetype={enquiry.archetype}
      startsOn={enquiry.requestedStart}
      requiredTaxBasis={requiredTaxBasisOf(enquiry)}
      isSubmitting={submit.isPending}
      onSend={handleSend}
      notice={
        visitIsOpen || refusedForVisit ? (
          <ErrorState
            inline
            title="Close the visit first"
            message="An estimate is sent after the visit is closed. Close it on the enquiry, then come back — nothing you have tapped is lost."
            severity="warning"
            actionLabel="Go to the enquiry"
            onAction={() => {
              window.location.href = enquiryHref;
            }}
          />
        ) : presentation ? (
          <ErrorState
            inline
            title={presentation.title}
            message={presentation.message}
            severity={presentation.severity}
            actionLabel="Try again"
            onAction={() => submit.reset()}
            reference={presentation.reference}
          />
        ) : null
      }
    />
  );
}

/**
 * The tax basis the requirement demands, or null when the vendor chooses.
 *
 * `required_tax_basis` is a server fact. When it is set, showing a choice with
 * one real answer is asking a question whose answer is already decided — and on
 * a screen built for somebody who cannot read the question, an unnecessary one
 * is worse than elsewhere.
 */
function requiredTaxBasisOf(enquiry: EnquiryRecord): TaxBasis | null {
  const required = enquiry.requiredTaxBasis;
  return required === "INCLUSIVE" || required === "EXCLUSIVE" ? required : null;
}
