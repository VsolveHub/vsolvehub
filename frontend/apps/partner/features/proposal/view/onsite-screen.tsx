"use client";

import { Card, ErrorState, Skeleton, SkeletonRegion, buttonStyles, useT } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "@/features/enquiry/queries";
import { PartnerHeaderTitle } from "@/features/session/partner-header-title";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { traceForInvitation, type Proposal } from "../model/proposal-state";
import { useMyProposals } from "../queries";
import { CommercialEstimateFlow } from "./commercial-estimate-flow";

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
  const t = useT();
  const [sent, setSent] = useState<Proposal | null>(null);
  const query = usePartnerEnquiry(invitationId);

  const back = (
    <Link
      href={enquiryHref}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      {t("proposal.screens.onsite.backToEnquiry")}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label={t("proposal.screens.onsite.loading")}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (query.isError || query.data === undefined) {
    const presentation = query.error
      ? describeError(query.error, "read")
      : describeError(new Error(t("proposal.screens.onsite.didNotLoad")), "read");
    const forbidden = isEnquiryForbidden(query.error);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={forbidden ? t("proposal.screens.onsite.forbidden.title") : presentation.title}
          message={
            forbidden
              ? t("proposal.screens.onsite.forbidden.message")
              : presentation.message
          }
          severity={presentation.severity}
          actionLabel={forbidden ? undefined : t("common.tryAgain")}
          onAction={forbidden ? undefined : () => void query.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const record = readEnquiryRecord(query.data);

  return (
    <>
      <PartnerHeaderTitle title={record.serviceName} />
      <div className="flex flex-col gap-4">
        {sent ? (
          <SentConfirmation proposal={sent} enquiryHref={enquiryHref} />
        ) : (
          <OnsiteComposerWithRevision
            enquiry={record}
            enquiryHref={enquiryHref}
            onSubmitted={setSent}
          />
        )}
      </div>
    </>
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
 *
 * ## One composer, two pricing types
 *
 * `CommercialEstimateFlow` mounts the rate-card composer over the autosaved
 * per-invitation draft. Its first step is the only choice a vendor makes about
 * *form*: Item-wise (points and units from the rate card) or Labour-wise
 * (people × days). There is no separate "detailed" composer any more — the
 * typed-rows form was a second way to say the same thing, and the owner chose
 * one (2026-08-30). Both types submit to `POST /proposals/` under the same
 * server rules.
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
  const t = useT();
  const mine = useMyProposals(enquiry.requirementId);

  if (mine.isPending) {
    return (
      <SkeletonRegion loading label={t("proposal.screens.onsite.checking")}>
        <Skeleton className="h-64 w-full" />
      </SkeletonRegion>
    );
  }

  if (mine.isError) {
    const presentation = describeError(mine.error, "read");
    return (
      <ErrorState
        title={t("proposal.screens.onsite.checkFailed.title")}
        message={t("proposal.screens.onsite.checkFailed.message", { message: presentation.message })}
        severity={presentation.severity}
        actionLabel={t("common.tryAgain")}
        onAction={() => void mine.refetch()}
        reference={presentation.reference}
      />
    );
  }

  const trace = traceForInvitation({
    proposals: mine.data.results,
    invitationId: enquiry.id,
  });
  const visit = planVisitOf(enquiry.siteVisits);
  const supersedesRevision = trace.current?.revision ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <CommercialEstimateFlow
        enquiry={enquiry}
        visit={visit}
        enquiryHref={enquiryHref}
        supersedesRevision={supersedesRevision}
        currentProposal={trace.current}
        onSubmitted={onSubmitted}
      />
    </div>
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
  const t = useT();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-text">{t("proposal.screens.onsite.sent.title")}</h2>
      <p className="text-sm leading-5 text-text-secondary">{t("proposal.screens.onsite.sent.waiting")}</p>
      <p className="text-sm leading-6 text-text-secondary">
        {t("proposal.screens.onsite.sent.revision", {
          revision: proposal.revision,
          when: new Date(proposal.submitted_at).toLocaleString(),
        })}
      </p>
      <Link href="/work/all" className={buttonStyles()}>
        {t("proposal.screens.onsite.sent.goToWork")}
      </Link>
      <Link href={enquiryHref} className={buttonStyles({ variant: "outline" })}>
        {t("proposal.screens.onsite.sent.viewEnquiry")}
      </Link>
    </Card>
  );
}
