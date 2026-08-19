"use client";

import { Card, ErrorState, Skeleton, SkeletonRegion, buttonStyles } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "@/features/enquiry/queries";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { traceForInvitation, type Proposal } from "../model/proposal-state";
import { useMyProposals } from "../queries";
import { TapEstimateComposer } from "./tap-estimate-composer";

/**
 * The route half of the on-site estimate (`M2-FE-315`).
 *
 * A screen of its own rather than a section of the enquiry, for one reason:
 * it is opened at a different moment, in a different place. The enquiry screen
 * is read on the way to deciding whether to travel; this is opened standing in
 * the customer's flat with the tape measure still out. Sharing a scroll with the
 * requirement summary, the clarification thread and the disclosure notice would
 * put four screens of reading above the first field.
 *
 * ## The revision it is superseding comes from the server
 *
 * `GET /proposals/?requirement=` gives the vendor's own quotes back, and the
 * highest revision on this invitation is what a new submission replaces. Reading
 * it here rather than passing it through a route parameter means a vendor who
 * opened this on a second phone still supersedes correctly — and it is what
 * keeps the idempotency key, which is scoped to the invitation *and* the
 * revision being replaced, from replaying the first estimate.
 *
 * ## Why the workspace gate is `enquiry.view`
 *
 * The same grant the enquiry itself is behind. There is no separate estimate
 * action published, and inventing one would be this client authorising itself.
 */

export interface OnsiteEstimateScreenProps {
  readonly invitationId: string;
}

export function OnsiteEstimateScreen({ invitationId }: OnsiteEstimateScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={PROJECT_WORKSPACE} actions={["enquiry.view"]}>
      {(workspace) => (
        <OnsiteEstimate
          invitationId={invitationId}
          enquiryHref={`${workspace.home}/enquiries/${invitationId}`}
        />
      )}
    </WorkspaceRoute>
  );
}

function OnsiteEstimate({
  invitationId,
  enquiryHref,
}: {
  readonly invitationId: string;
  readonly enquiryHref: string;
}) {
  const [sent, setSent] = useState<Proposal | null>(null);
  const query = usePartnerEnquiry(invitationId);

  const back = (
    <Link
      href={enquiryHref}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      Back to the enquiry
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label="Loading this request">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
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
          title={forbidden ? "This request is not yours" : presentation.title}
          message={
            forbidden
              ? "Vsolve has no enquiry with this reference on your account."
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

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text">{enquiry.serviceName}</h1>
        <p className="text-sm leading-6 text-text-secondary">
          Tap what the job needs and put a price on each one.
        </p>
      </header>

      {sent ? (
        <SentConfirmation proposal={sent} enquiryHref={enquiryHref} />
      ) : (
        <OnsiteComposerWithRevision
          enquiry={enquiry}
          enquiryHref={enquiryHref}
          onSubmitted={setSent}
        />
      )}
    </div>
  );
}

/**
 * Waits for the revision number before mounting the composer.
 *
 * A submission whose `supersedesRevision` is wrong is not a cosmetic problem:
 * the idempotency key is scoped to it, so guessing `0` for what is really a
 * second estimate would replay the first one and the customer would never see
 * the new price — with nothing reporting an error. So the composer mounts once
 * the read has answered, and a failed read says so rather than defaulting.
 */
function OnsiteComposerWithRevision({
  enquiry,
  enquiryHref,
  onSubmitted,
}: {
  readonly enquiry: ReturnType<typeof readEnquiryRecord>;
  readonly enquiryHref: string;
  readonly onSubmitted: (proposal: Proposal) => void;
}) {
  const mine = useMyProposals(enquiry.requirementId);

  if (mine.isPending) {
    return (
      <SkeletonRegion loading label="Checking whether you have already estimated">
        <Skeleton className="h-64 w-full" />
      </SkeletonRegion>
    );
  }

  if (mine.isError) {
    const presentation = describeError(mine.error, "read");
    return (
      <ErrorState
        title="Vsolve could not check your earlier estimates"
        message={`${presentation.message} Sending one now could replay an estimate you already sent, so the form stays closed until this read works.`}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={() => void mine.refetch()}
        reference={presentation.reference}
      />
    );
  }

  const trace = traceForInvitation({
    proposals: mine.data.results,
    invitationId: enquiry.id,
  });

  return (
    <TapEstimateComposer
      enquiry={enquiry}
      visit={planVisitOf(enquiry.siteVisits)}
      enquiryHref={enquiryHref}
      supersedesRevision={trace.current?.revision ?? 0}
      onSubmitted={onSubmitted}
    />
  );
}

/**
 * What a sent estimate says.
 *
 * The figure shown is Django's echoed `total_paise`, not the local computation
 * that produced the request — for an A5 estimate the server reconciles the parts
 * against it and refuses a mismatch, so the echo is a confirmation rather than a
 * repetition.
 */
function SentConfirmation({
  proposal,
  enquiryHref,
}: {
  readonly proposal: Proposal;
  readonly enquiryHref: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-text">Your estimate is with the customer</h2>
      <p className="text-sm leading-6 text-text-secondary">
        They can read it in full — there is nothing further for them to pay to see it — and they
        will compare it with the other estimates they booked. You can send a revised one from the
        enquiry at any time until they choose; nothing is overwritten.
      </p>
      <p className="text-sm leading-6 text-text-secondary">
        Revision {proposal.revision} · recorded {new Date(proposal.submitted_at).toLocaleString()}
      </p>
      <Link href={enquiryHref} className={buttonStyles({ variant: "outline" })}>
        Back to the enquiry
      </Link>
    </Card>
  );
}
