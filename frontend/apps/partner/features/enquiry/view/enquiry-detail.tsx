"use client";

import { Badge, Card, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { A3Composer } from "@/features/proposal/view/a3-composer";
import { A5Composer } from "@/features/proposal/view/a5-composer";
import { ProposalStatus } from "@/features/proposal/view/proposal-status";
import type { Proposal } from "@/features/proposal/model/proposal-state";
import { WORKFORCE_WORKSPACE, PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { readHeadcount } from "../model/requirement-facts";
import { readEnquiryRecord } from "../model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "../queries";
import { ClarificationPanel } from "./clarification-panel";
import { DisclosureNotice } from "./disclosure-notice";
import { EnquiryDeadline } from "./enquiry-deadline";
import { RequirementSummary } from "./requirement-summary";
import { RespondActions } from "./respond-actions";
import { SiteVisitPanel } from "./site-visit-panel";

/**
 * One enquiry, end to end: read it, answer it, quote on it.
 *
 * Composes `M2-FE-302` through `M2-FE-313` into the single screen the flow-weight
 * budget requires for an A3 response. Reading order is the decision order — what
 * is being asked for, whether to take it, then the price — so a vendor who
 * scrolls once has done the whole job.
 *
 * ## Which composer opens
 *
 * `EnquiryDetail.archetype`, a field Django sent, compared against the workspace
 * keys the registry knows. Never inferred from the category slug, the service
 * name or anything a person typed. An archetype this build has no composer for
 * renders no composer — the same rule as an unknown workspace key, for the same
 * reason: there are no screens behind it and a generic form would collect fields
 * the server will refuse.
 *
 * ## Where the composer sits
 *
 * Below the requirement and below the accept/decline pair, and only once the
 * enquiry is accepted — `submit_proposal` refuses anything else with "Accept this
 * enquiry before quoting on it." Showing a price form above an un-accepted
 * enquiry would invite a vendor to write a quote that cannot be sent.
 */

export interface EnquiryDetailProps {
  readonly invitationId: string;
  /** The workspace list this screen belongs to, for the back link. */
  readonly basePath: string;
  readonly backLabel: string;
}

export function EnquiryDetail({ invitationId, basePath, backLabel }: EnquiryDetailProps) {
  const query = usePartnerEnquiry(invitationId);
  // The record from this session's own submission. There is no read that finds
  // it again after this tab closes — see `proposal-state.resolveProposalView`.
  const [submitted, setSubmitted] = useState<Proposal | null>(null);
  const [revising, setRevising] = useState(false);

  const back = (
    <Link
      href={basePath}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      {backLabel}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label="Loading this enquiry">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (query.isError) {
    const presentation = describeError(query.error, "read");
    const forbidden = isEnquiryForbidden(query.error);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={forbidden ? "This enquiry is not yours to read" : presentation.title}
          message={
            forbidden
              ? "Vsolve has no enquiry with this reference on your account. If you followed a link from somewhere else, it may belong to another vendor."
              : presentation.message
          }
          severity={presentation.severity}
          actionLabel={forbidden ? undefined : "Try again"}
          onAction={forbidden ? undefined : () => void query.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const enquiry = readEnquiryRecord(query.data);
  const status = describeStatus(enquiry.status);
  const permissions = permissionsFor(enquiry.status);
  const service = enquiry.categorySlug.replace(/[-_]+/g, " ");

  const composerFor = (archetype: string) => {
    const shared = {
      invitationId: enquiry.id,
      requirementId: enquiry.requirementId,
      supersedesRevision: submitted?.revision ?? (enquiry.status === "QUOTED" ? 1 : 0),
      onSubmitted: (proposal: Proposal) => {
        setSubmitted(proposal);
        setRevising(false);
      },
    };

    if (archetype === WORKFORCE_WORKSPACE) {
      return <A3Composer {...shared} suggestedWorkerCount={readHeadcount(enquiry.answers)} />;
    }
    if (archetype === PROJECT_WORKSPACE) {
      return <A5Composer {...shared} />;
    }
    // A lifecycle this build has no composer for. Nothing is rendered rather
    // than a generic price form, which would collect fields the server refuses.
    return (
      <Card className="p-4 text-sm leading-6 text-text-secondary">
        Vsolve cannot show a quote form for this kind of work in this version of the app. Support can
        take your quote over the phone.
      </Card>
    );
  };

  // Show the composer when there is nothing to supersede, or when the vendor
  // explicitly asked to revise. A live quote is a record first and a form
  // second — replacing it should be a decision, not the default view.
  const showComposer =
    permissions.canQuote && (revising || (submitted === null && enquiry.status === "ACCEPTED"));

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold capitalize text-text">{service}</h1>
          <Badge
            tone={
              status.tone === "action" ? "action" : status.tone === "progress" ? "info" : "neutral"
            }
            dot
          >
            {status.label}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-text-secondary">{status.meaning}</p>
      </header>

      {permissions.canAccept ? <EnquiryDeadline respondsBy={enquiry.respondsBy} /> : null}

      <RequirementSummary enquiry={enquiry} />

      <RespondActions enquiry={enquiry} />

      <ProposalStatus
        enquiryStatus={enquiry.status}
        proposal={submitted}
        requirementId={enquiry.requirementId}
        onRevise={() => setRevising(true)}
      />

      {showComposer ? composerFor(enquiry.archetype) : null}

      <ClarificationPanel enquiry={enquiry} />

      <SiteVisitPanel enquiry={enquiry} />

      <DisclosureNotice />
    </div>
  );
}
