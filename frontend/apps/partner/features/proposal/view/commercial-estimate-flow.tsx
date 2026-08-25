"use client";

import { describeError } from "@vsolve/query";
import { Card, ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { isVisitNotCompleted } from "@/features/visit/queries";
import type { SiteVisit } from "@/features/visit/model/visit-state";

import type { ProposalRequest } from "../model/commercial-estimate-draft";
import { isProposalWindowClosed, useSubmitProposal, type Proposal } from "../queries";
import {
  CommercialEstimateComposer,
  clearSavedCommercialEstimate,
} from "./commercial-estimate-composer";
import { EstimateClosedDialog } from "./tap-estimate-composer";

/**
 * The item-wise / labour-wise estimate, wired to the submit that already works.
 *
 * Same shape and same guards as `TapEstimateComposer`, deliberately: the two are
 * alternative composers over one wire contract, and a rule enforced on one side
 * only would make the flows disagree about what an estimate is. The parts that
 * differ are the composer being mounted and one extra job on success — the
 * commercial draft autosaves to localStorage, and a sent estimate must not
 * reappear as a half-filled form on the vendor's next enquiry visit.
 *
 * The submit body comes back from the composer itself rather than being rebuilt
 * here, because the composer only enables Send once the server's own preview has
 * priced exactly that body. Rebuilding it would reopen the gap the preview
 * fingerprint closes.
 */

export interface CommercialEstimateFlowProps {
  readonly enquiry: EnquiryRecord;
  readonly visit: SiteVisit | null;
  readonly enquiryHref: string;
  readonly supersedesRevision: number;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function CommercialEstimateFlow({
  enquiry,
  visit,
  enquiryHref,
  supersedesRevision,
  onSubmitted,
}: CommercialEstimateFlowProps) {
  const submit = useSubmitProposal();

  const visitIsOpen = visit !== null && visit.status !== "COMPLETED";
  const refusedForVisit = isVisitNotCompleted(submit.error);
  const windowClosed = isProposalWindowClosed(submit.error);
  const presentation =
    submit.error && !refusedForVisit && !windowClosed
      ? describeError(submit.error, "mutation")
      : null;

  function handleSend(request: ProposalRequest): void {
    if (visit === null || submit.isPending) return;
    submit.mutate(
      {
        body: request,
        supersedesRevision,
        requirementId: enquiry.requirementId,
        invitationId: enquiry.id,
      },
      {
        onSuccess: (proposal) => {
          clearSavedCommercialEstimate(enquiry.id);
          onSubmitted(proposal);
        },
      },
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
    <>
      <CommercialEstimateComposer
        invitationId={enquiry.id}
        siteVisitId={visit.id}
        serviceName={enquiry.serviceName}
        archetype={enquiry.archetype}
        isSubmitting={submit.isPending}
        onSend={handleSend}
        notice={
          visitIsOpen || refusedForVisit ? (
            <ErrorState
              inline
              title="Close the visit first"
              message="An estimate is sent after the visit is closed. Close it on the enquiry, then come back — your priced lines are saved."
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
      {windowClosed ? <EstimateClosedDialog /> : null}
    </>
  );
}
