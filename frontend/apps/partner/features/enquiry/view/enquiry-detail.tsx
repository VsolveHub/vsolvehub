"use client";

import { Badge, Card, ErrorState, Skeleton, SkeletonRegion, buttonStyles } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { A3Composer } from "@/features/proposal/view/a3-composer";
import { ProposalStatus } from "@/features/proposal/view/proposal-status";
import type { Proposal } from "@/features/proposal/model/proposal-state";
import { VisitDayPanel } from "@/features/visit/view/visit-day-panel";
import { VisitResponse } from "@/features/visit/view/visit-response";
import { WORKFORCE_WORKSPACE, PROJECT_WORKSPACE } from "@/features/workspace/registry";

import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { readHeadcount } from "../model/requirement-facts";
import { planVisitOf, readEnquiryRecord } from "../model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "../queries";
import { ClarificationPanel } from "./clarification-panel";
import { DisclosureNotice } from "./disclosure-notice";
import { EnquiryDeadline } from "./enquiry-deadline";
import { RequirementSummary } from "./requirement-summary";
import { RespondActions } from "./respond-actions";
import { SiteVisitPanel } from "./site-visit-panel";

/**
 * One enquiry, end to end: read it, answer it, price it.
 *
 * Composes `M2-FE-302` through `M2-FE-315` into the single screen the
 * flow-weight budget requires. Reading order is the decision order — what is
 * being asked for, whether to take it, then the price — so a vendor who scrolls
 * once has done the whole job.
 *
 * ## Two lifecycles, two ways of saying yes
 *
 * `EnquiryDetail.archetype`, a field Django sent, compared against the workspace
 * keys the registry knows. Never inferred from the category slug, the service
 * name or anything a person typed.
 *
 * - **A3 (workforce)** — Accept or decline, then quote on one screen. Unchanged.
 * - **A5 (projects)** — under revision 3 there is no separate accept.
 *   **Confirming a visit slot *is* acceptance**: it takes the quote slot, the
 *   soft capacity hold and a hard reservation on the shared availability grid in
 *   one command. So `RespondActions` is replaced by the slot picker, and the
 *   estimate is written on site afterwards rather than composed here.
 *
 * An archetype this build has no lifecycle for renders no controls — the same
 * rule as an unknown workspace key, for the same reason: there are no screens
 * behind it and a generic form would collect fields the server will refuse.
 *
 * ## Why the A5 composer is not on this screen any more
 *
 * Revision 3 retires the remote A5 quote. An estimate must reference a
 * `COMPLETED` visit — `m2_visit_not_completed` is the refusal — so a composer
 * here would be a form the server declines to accept. What is offered instead is
 * the route to the on-site composer, and it is offered only once the visit is
 * closed.
 */

export interface EnquiryDetailProps {
  readonly invitationId: string;
  /** The workspace list this screen belongs to, for the back link. */
  readonly basePath: string;
  readonly backLabel: string;
}

export function EnquiryDetail({ invitationId, basePath, backLabel }: EnquiryDetailProps) {
  const query = usePartnerEnquiry(invitationId);
  // The record from this session's own submission. The list read finds it again
  // after a reload; this is simply newer than the page a cursor read returns.
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
  const isProject = enquiry.archetype === PROJECT_WORKSPACE;
  const isWorkforce = enquiry.archetype === WORKFORCE_WORKSPACE;
  const estimateHref = `${basePath}/${enquiry.id}/estimate`;
  const planVisit = planVisitOf(enquiry.siteVisits);

  // Show the composer when there is nothing to supersede, or when the vendor
  // explicitly asked to revise. A live quote is a record first and a form
  // second — replacing it should be a decision, not the default view.
  const showA3Composer =
    isWorkforce &&
    permissions.canQuote &&
    (revising || (submitted === null && enquiry.status === "ACCEPTED"));

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* The catalogue's own name (1.24.0). The old heading de-slugged
              `category_slug`, which is a routing key rather than a name. */}
          <h1 className="text-xl font-semibold text-text">{enquiry.serviceName}</h1>
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

      {isProject ? (
        <>
          <VisitResponse enquiry={enquiry} />
          <VisitDayPanel enquiry={enquiry} estimateHref={estimateHref} />
        </>
      ) : (
        <RespondActions enquiry={enquiry} />
      )}

      <ProposalStatus
        enquiryStatus={enquiry.status}
        invitationId={enquiry.id}
        requirementId={enquiry.requirementId}
        submitted={submitted}
        onRevise={() => {
          if (isProject) {
            // A revision to a project estimate is another on-site submission and
            // carries the same completed-visit guard, so it goes to the same
            // screen rather than opening a second composer here.
            window.location.assign(estimateHref);
            return;
          }
          setRevising(true);
        }}
      />

      {showA3Composer ? (
        <A3Composer
          invitationId={enquiry.id}
          requirementId={enquiry.requirementId}
          supersedesRevision={submitted?.revision ?? (enquiry.status === "QUOTED" ? 1 : 0)}
          onSubmitted={(proposal: Proposal) => {
            setSubmitted(proposal);
            setRevising(false);
          }}
          suggestedWorkerCount={readHeadcount(enquiry.answers)}
        />
      ) : null}

      {isProject && permissions.canQuote ? (
        <EstimateInvitation
          href={estimateHref}
          visitIsComplete={planVisit?.status === "COMPLETED"}
          hasVisit={planVisit !== null}
        />
      ) : null}

      {!isProject && !isWorkforce ? (
        <Card className="p-4 text-sm leading-6 text-text-secondary">
          Vsolve cannot show a quote form for this kind of work in this version of the app. Support
          can take your quote over the phone.
        </Card>
      ) : null}

      <ClarificationPanel enquiry={enquiry} />

      {/* The ad-hoc paid visit stays available on both lifecycles — for A5 it is
          the second look, beside the plan visit rather than instead of it. */}
      <SiteVisitPanel enquiry={enquiry} />

      <DisclosureNotice />
    </div>
  );
}

/**
 * The way into the on-site estimate composer.
 *
 * Offered as a link rather than a form because the estimate is written at the
 * customer's address, on a screen built for that. It is never hidden: a vendor
 * whose visit is not closed yet is told what has to happen first, in the same
 * place they would look for the button.
 */
function EstimateInvitation({
  href,
  visitIsComplete,
  hasVisit,
}: {
  readonly href: string;
  readonly visitIsComplete: boolean;
  readonly hasVisit: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-text">Your estimate</h2>
      <p className="text-sm leading-6 text-text-secondary">
        {visitIsComplete
          ? "Your visit is closed, so the estimate is ready to write. Send it inside the window shown above — a visit that produces no estimate is refunded to the customer and pays you nothing."
          : hasVisit
            ? "Write this at the customer's address, once you have been and closed the visit. Vsolve will not take a project estimate from someone who has not seen the site — that is what the customer paid for."
            : "Confirm a visit slot first. Vsolve only takes a project estimate from a professional who has been to the site."}
      </p>
      {hasVisit ? (
        <Link href={href} className={buttonStyles({ variant: visitIsComplete ? "primary" : "outline" })}>
          {visitIsComplete ? "Write the estimate" : "Open the estimate form"}
        </Link>
      ) : null}
    </Card>
  );
}
