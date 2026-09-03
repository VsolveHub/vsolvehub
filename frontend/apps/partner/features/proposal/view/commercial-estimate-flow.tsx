"use client";

import { describeError } from "@vsolve/query";
import { Card, ErrorState, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { isVisitNotCompleted } from "@/features/visit/queries";
import type { SiteVisit } from "@/features/visit/model/visit-state";

import {
  commercialEstimateFromProposal,
  type ProposalRequest,
} from "../model/commercial-estimate-draft";
import {
  isCustomTitleScreened,
  isProposalWindowClosed,
  isRateOutsideBand,
  useSubmitProposal,
  type Proposal,
} from "../queries";
import { clearSavedCommercialEstimate } from "./commercial-estimate-composer";
import { RateCardEstimateComposer } from "./rate-card-estimate-composer";
import { EstimateClosedDialog } from "./tap-estimate-composer";

/**
 * The item-wise / labour-wise estimate, wired to the submit that already works.
 *
 * Mounts the rate-card composer over the autosaved per-invitation draft and
 * owns the guards around sending: the visit must be closed, the window must be
 * open, and a sent estimate must not reappear as a half-filled form on the
 * vendor's next enquiry visit (the draft autosaves to localStorage).
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
  readonly currentProposal: Proposal | null;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function CommercialEstimateFlow({
  enquiry,
  visit,
  enquiryHref,
  supersedesRevision,
  currentProposal,
  onSubmitted,
}: CommercialEstimateFlowProps) {
  const submit = useSubmitProposal();

  const visitIsOpen = visit !== null && visit.status !== "COMPLETED";
  const refusedForVisit = isVisitNotCompleted(submit.error);
  const windowClosed = isProposalWindowClosed(submit.error);
  // A line-level refusal (1.48.0) is rendered beside the line by the composer,
  // not as a banner above it — the banner would name the range and the row
  // would not, which is the wrong way round.
  const lineRefusal = isRateOutsideBand(submit.error) || isCustomTitleScreened(submit.error);
  const presentation =
    submit.error && !refusedForVisit && !windowClosed
      ? describeError(submit.error, "mutation")
      : null;
  const materialMode = enquiry.materialFulfilmentMode;

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

  if (materialMode !== "CUSTOMER_PROCURES" && materialMode !== "PARTNER_TURNKEY") {
    return (
      <ErrorState
        title="This estimate is not configured yet"
        message="Vsolve has not published who supplies materials for this service. Your draft is safe; try again after Operations updates the service."
        severity="warning"
      />
    );
  }

  const blockingNotice =
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
    ) : presentation && !lineRefusal ? (
      <ErrorState
        inline
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={() => submit.reset()}
        reference={presentation.reference}
      />
    ) : null;
  const notice = (
    <>
      {currentProposal !== null ? (
        <ErrorState
          inline
          severity="info"
          title={`Revising estimate revision ${currentProposal.revision}`}
          message={`Your current estimate is loaded below. Change only what is needed; sending creates revision ${currentProposal.revision + 1} and keeps the earlier version in the history.`}
        />
      ) : null}
      {blockingNotice}
    </>
  );

  return (
    <>
      <RateCardEstimateComposer
        invitationId={enquiry.id}
        siteVisitId={visit.id}
        serviceName={enquiry.serviceName}
        brief={enquiry.brief}
        pricingSkillCode={enquiry.pricingSkillCode}
        materialFulfilmentMode={materialMode}
        visitCompleted={visit.status === "COMPLETED"}
        initialDraft={
          currentProposal === null ? null : commercialEstimateFromProposal(currentProposal)
        }
        isSubmitting={submit.isPending}
        submitError={submit.error}
        onSend={handleSend}
        notice={notice}
      />
      {windowClosed ? <EstimateClosedDialog /> : null}
    </>
  );
}
