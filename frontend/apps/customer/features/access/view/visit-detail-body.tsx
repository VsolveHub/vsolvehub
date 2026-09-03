"use client";

import {
  Badge,
  Button,
  ConfirmAction,
  Disclosure,
  Skeleton,
  Timeline,
  TimelineEvent,
  buttonStyles,
} from "@vsolve/ui";
import { canReadFullEstimates } from "@vsolve/query";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { toQuoteListView, type QuoteCardView } from "@/features/quotes/adapters";
import { useCustomerQuotes } from "@/features/quotes/queries";
import { requestEstimateHref, requestQuotesHref } from "@/lib/routes";

import { calendarDay, formatVisitSlot, type VisitSlotRow } from "../adapters";
import {
  useIssueVisitArrivalCode,
  useReportVendorNoShow,
  useVisitArrivalCode,
  useVisitPlan,
} from "../queries";
import { AccessRefusal } from "./access-refusal";
import { ArrivalCodePanel } from "./arrival-code-panel";
import { SlotMoneyLine, slotMoneySummary } from "./visit-money";
import { VendorIdentity } from "./vendor-identity";

/**
 * The visit record itself — who, when, what happens next, the hold.
 *
 * Shared by the dedicated visit page and the request page's one-visit layout
 * so the two cannot drift. Arrival and the no-show command live in
 * `VisitDetailAside`, because the request page already has a rail of its own.
 */

export interface VisitChargeSummary {
  amountLabel: string;
}

export interface VisitDetailPrimaryProps {
  row: VisitSlotRow;
  planSize: number;
  requirementId: string;
  supportAction?: ReactNode;
  /**
   * `h2` on the request page, which already has an `h1`. The visit URL keeps
   * `h1` so a bookmark still opens a page whose title is the visit.
   */
  headingLevel?: "h1" | "h2";
  /** Paid status and amount, shown on the request when this is the only visit. */
  chargeSummary?: VisitChargeSummary | null;
}

export function VisitDetailPrimary({
  row,
  planSize,
  requirementId,
  supportAction,
  headingLevel = "h1",
  chargeSummary = null,
}: VisitDetailPrimaryProps) {
  const planQuery = useVisitPlan(requirementId);
  const mayReadEstimates =
    planQuery.data !== undefined && canReadFullEstimates(planQuery.data);
  const estimatesQuery = useCustomerQuotes(requirementId, mayReadEstimates);
  const estimate =
    estimatesQuery.data === undefined
      ? null
      : (toQuoteListView(estimatesQuery.data).cards.find(
          (card) => card.siteVisitId === row.visitId,
        ) ?? null);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <VisitHeader
        row={row}
        planSize={planSize}
        headingLevel={headingLevel}
        chargeSummary={chargeSummary}
      />

      {row.vendor !== null ? (
        <section
          aria-labelledby="visit-vendor-heading"
          className="rounded-card border border-line bg-surface p-4"
        >
          <h2 id="visit-vendor-heading" className="text-sm font-semibold text-text">
            Who is coming
          </h2>
          <VendorIdentity vendor={row.vendor} size="lg" className="mt-3" />
          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            You can reach them through us until the work is agreed. We pass
            messages on the same day.
          </p>
        </section>
      ) : null}

      <VisitProgress row={row} requirementId={requirementId} />

      {estimate !== null ? (
        <VisitEstimateSummary
          estimate={estimate}
          href={requestEstimateHref(requirementId, estimate.proposalId)}
        />
      ) : mayReadEstimates && estimatesQuery.isPending && row.state === "completed" ? (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the estimate from this visit</span>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : estimatesQuery.error !== null && row.state === "completed" ? (
        <AccessRefusal
          error={estimatesQuery.error}
          attempting="read the estimate from this visit"
          supportAction={supportAction}
          onRetry={() => void estimatesQuery.refetch()}
          inline={false}
        />
      ) : null}

      <VisitMoneyCard row={row} />
    </div>
  );
}

export interface VisitDetailAsideProps {
  row: VisitSlotRow;
  requirementId: string;
  supportAction?: ReactNode;
}

export function VisitDetailAside({
  row,
  requirementId,
  supportAction,
}: VisitDetailAsideProps) {
  const siteVisitId = row.visitId;
  const noShow = useReportVendorNoShow();
  const issueCode = useIssueVisitArrivalCode();
  const codeQuery = useVisitArrivalCode(
    siteVisitId,
    row.state === "scheduled" || row.state === "in_progress",
  );

  return (
    <>
      <ArrivalCodePanel
        code={codeQuery.data ?? null}
        isLoading={codeQuery.isPending && codeQuery.fetchStatus !== "idle"}
        onIssue={() => {
          if (siteVisitId === null) return;
          issueCode.mutate({ siteVisitId });
        }}
        isIssuing={issueCode.isPending}
        issueError={issueCode.error}
        supportAction={supportAction}
      />

      <VisitCommands
        row={row}
        onReportNoShow={(visitId) =>
          noShow.mutate({
            siteVisitId: visitId,
            requirementId,
            reasonCode: "VENDOR_DID_NOT_ARRIVE",
          })
        }
        isPending={noShow.isPending}
      />

      <AccessRefusal
        error={noShow.error}
        attempting="update this visit"
        supportAction={supportAction}
      />
    </>
  );
}

/** The estimate produced by this visit, matched through `proposal.site_visit.id`. */
function VisitEstimateSummary({
  estimate,
  href,
}: {
  estimate: QuoteCardView;
  href: string;
}) {
  return (
    <section
      aria-labelledby="visit-estimate-heading"
      className="rounded-card border border-success-line bg-success-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-success-text">
            Estimate ready
          </p>
          <h2 id="visit-estimate-heading" className="mt-1 text-lg font-extrabold text-text">
            {estimate.vendorName ?? "This professional"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {estimate.revision > 1 ? `Revision ${estimate.revision} · ` : ""}Written after this
            visit
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {estimate.isVerified ? <Badge tone="success">Verified</Badge> : null}
          <p data-numeric className="text-xl font-extrabold text-text">
            {estimate.payableLabel}
          </p>
        </div>
      </div>

      <Link
        href={href}
        className={buttonStyles({ variant: "outline", className: "mt-4 w-full sm:w-auto" })}
      >
        Read this estimate in full
      </Link>
    </section>
  );
}

const STATE_BADGE: Record<
  VisitSlotRow["state"],
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  awaiting: { label: "Waiting for a professional", tone: "neutral" },
  // Distinct from `awaiting` on purpose. "Waiting" says the search is running;
  // these two say it finished, and collapsing them is what left a settled dead
  // end wearing a live spinner.
  unmatched: { label: "No professional found", tone: "warning" },
  dropped: { label: "Dropped", tone: "neutral" },
  held: { label: "Holding a time for you", tone: "warning" },
  scheduled: { label: "Confirmed", tone: "success" },
  in_progress: { label: "On site", tone: "info" },
  completed: { label: "Visited", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  vendor_no_show: { label: "They did not come", tone: "danger" },
  customer_no_show: { label: "Nobody was on site", tone: "warning" },
};

function VisitHeader({
  row,
  planSize,
  headingLevel,
  chargeSummary,
}: {
  row: VisitSlotRow;
  planSize: number;
  headingLevel: "h1" | "h2";
  chargeSummary: VisitChargeSummary | null;
}) {
  const badge = STATE_BADGE[row.state] ?? STATE_BADGE.awaiting;
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);
  const day = calendarDay(row.scheduledFor, row.timeZone);
  const Heading = headingLevel;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
        {day === null ? null : (
          <div
            aria-hidden
            className="flex size-14 shrink-0 flex-col items-center justify-center rounded-control bg-action-secondary text-action-secondary-text"
          >
            <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] opacity-75">
              {day.weekday}
            </span>
            <span className="text-2xl font-extrabold leading-none">{day.dayOfMonth}</span>
            <span className="text-[0.625rem] font-bold uppercase tracking-[0.06em] opacity-75">
              {day.month}
            </span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading className="text-lg font-extrabold tracking-tight text-text">
            {when ?? "No time confirmed yet"}
          </Heading>
          <p
            className={
              chargeSummary !== null
                ? "flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary"
                : "text-sm font-medium text-text-secondary"
            }
          >
            Visit {row.position} of {planSize}
            {chargeSummary !== null ? (
              <Badge tone={badge.tone} className="shrink-0">
                {badge.label}
              </Badge>
            ) : null}
          </p>
        </div>

        {chargeSummary !== null ? (
          <div className="shrink-0 text-right">
            <p className="flex items-center justify-end gap-2 text-xs font-medium text-text-secondary">
              Status
              <Badge tone="success">Paid</Badge>
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Amount{" "}
              <span data-numeric className="font-extrabold text-text">
                {chargeSummary.amountLabel}
              </span>
            </p>
          </div>
        ) : (
          <Badge tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        )}
      </div>
    </header>
  );
}

function VisitProgress({ row, requirementId }: { row: VisitSlotRow; requirementId: string }) {
  const reached = (state: VisitSlotRow["state"][]) => state.includes(row.state);
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);

  return (
    <section
      aria-labelledby="visit-progress-heading"
      className="rounded-card border border-line bg-surface p-4"
    >
      <h2 id="visit-progress-heading" className="text-sm font-semibold text-text">
        What happens
      </h2>
      <Timeline label="This visit, step by step" className="mt-3">
        <TimelineEvent
          title="A professional took this slot"
          timestamp={row.vendor === null ? "Not yet" : "Confirmed"}
          actor={row.vendor?.displayName}
          tone={row.vendor === null ? "neutral" : "success"}
        />
        <TimelineEvent
          title="They arrive and you share your code"
          timestamp={when ?? "Not scheduled yet"}
          tone={reached(["in_progress", "completed"]) ? "success" : "neutral"}
        />
        <TimelineEvent
          title="They finish looking and leave"
          timestamp={
            row.state === "completed" ? "Done" : "After they have seen the work"
          }
          tone={row.state === "completed" ? "success" : "neutral"}
        />
        <TimelineEvent
          title="Their written estimate reaches you"
          timestamp={
            row.estimateDueAt === null
              ? "After the visit"
              : `By ${formatVisitSlot(row.estimateDueAt, row.timeZone) ?? "after the visit"}`
          }
          tone="neutral"
        >
          {row.state === "completed" ? (
            <Link
              href={requestQuotesHref(requirementId)}
              className="text-sm font-medium text-text-link hover:underline"
            >
              Read the estimates
            </Link>
          ) : (
            <p className="text-sm text-text-secondary">
              If it does not arrive, this visit refunds its share or we send
              somebody else, free.
            </p>
          )}
        </TimelineEvent>
      </Timeline>
    </section>
  );
}

function VisitCommands({
  row,
  onReportNoShow,
  isPending,
}: {
  row: VisitSlotRow;
  onReportNoShow: (visitId: string) => void;
  isPending: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const visitId = row.visitId;
  if (visitId === null || !row.canReportNoShow) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {row.canReportNoShow ? (
        <>
          <Button variant="ghost" onClick={() => setReporting(true)}>
            They did not turn up
          </Button>
          <ConfirmAction
            open={reporting}
            onOpenChange={setReporting}
            title="Tell us they did not come?"
            consequence="This visit will not cost you anything, and we will either refund its share of the plan or send another professional free. It also counts against them, so only do this if nobody turned up."
            confirmLabel="Yes, nobody came"
            pending={isPending}
            onConfirm={() => {
              setReporting(false);
              onReportNoShow(visitId);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function VisitMoneyCard({ row }: { row: VisitSlotRow }) {
  return (
    <section
      aria-labelledby="visit-money-heading"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:gap-5"
    >
      <div className="relative shrink-0 overflow-hidden rounded-plate bg-canvas py-3 pl-5 pr-4 ring-1 ring-inset ring-line">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-line-strong" />
        <h2
          id="visit-money-heading"
          className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-secondary"
        >
          Held for this visit
        </h2>
        <p data-numeric className="mt-0.5 text-2xl font-extrabold leading-none text-text">
          {row.money.amountLabel}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-pretty text-sm font-semibold leading-6 text-text">
          {slotMoneySummary(row)}
        </p>
        <Disclosure summary="What happens to this money" className="mt-1.5">
          <SlotMoneyLine row={row} />
        </Disclosure>
      </div>
    </section>
  );
}
