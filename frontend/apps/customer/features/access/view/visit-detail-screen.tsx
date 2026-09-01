"use client";

import {
  Badge,
  Button,
  ConfirmAction,
  Disclosure,
  EmptyState,
  Skeleton,
  Timeline,
  TimelineEvent,
  buttonStyles,
} from "@vsolve/ui";
import { canReadFullEstimates } from "@vsolve/query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toQuoteListView, type QuoteCardView } from "@/features/quotes/adapters";
import { useCustomerQuotes } from "@/features/quotes/queries";
import { requestEstimateHref, requestHref, requestQuotesHref } from "@/lib/routes";

import {
  calendarDay,
  formatVisitSlot,
  toVisitTrackerView,
  type VisitSlotRow,
} from "../adapters";
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
 * One site visit, on a page of its own.
 *
 * ## Why this page exists
 *
 * The tracker was carrying four blocks of prose and two destructive controls per
 * row, three rows deep, and it was the only place any of it could go. Everything
 * that is genuinely about *one* visit lives here now: who is coming, the arrival
 * code, what the money did, what happens next, and the no-show command. The list
 * went back to being a list.
 *
 * ## Why it reads the plan rather than the visit
 *
 * There is no single-visit read, and adding one would publish a fourth view of
 * the same slot. The plan read already carries every visit and every share, and
 * the tracker adapter already joins them — so this finds its row in that, which
 * also means the page and the list can never disagree about a slot's state.
 *
 * The cost is honest and small: this page refetches a plan to render one row.
 * The plan is at most a handful of shares, and the alternative is a second
 * server view that has to be kept in step with the first.
 *
 * ## What is deliberately absent
 *
 * No phone number and no address. Contact is released by the engagement, not by
 * a visit, and putting a mobile number on this page would be a contact-unlock
 * nobody paid for.
 */

export interface VisitDetailScreenProps {
  requirementId: string;
  siteVisitId: string;
  supportAction?: React.ReactNode;
}

export function VisitDetailScreen({
  requirementId,
  siteVisitId,
  supportAction,
}: VisitDetailScreenProps) {
  const planQuery = useVisitPlan(requirementId);
  const noShow = useReportVendorNoShow();
  const issueCode = useIssueVisitArrivalCode();

  const mayReadEstimates =
    planQuery.data !== undefined && canReadFullEstimates(planQuery.data);
  const estimatesQuery = useCustomerQuotes(requirementId, mayReadEstimates);

  const tracker =
    planQuery.data === undefined ? null : toVisitTrackerView(planQuery.data);
  const row = tracker?.rows.find((candidate) => candidate.visitId === siteVisitId) ?? null;
  const estimate =
    estimatesQuery.data === undefined
      ? null
      : (toQuoteListView(estimatesQuery.data).cards.find(
          (card) => card.siteVisitId === siteVisitId,
        ) ?? null);

  // Asked for only once the slot is at a point where arrival is the question.
  // A code read for a visit nobody has confirmed yet would be a request the
  // server answers with "you cannot have one", on every render of the page.
  const codeQuery = useVisitArrivalCode(
    siteVisitId,
    row !== null && (row.state === "scheduled" || row.state === "in_progress"),
  );

  if (planQuery.isPending) {
    return (
      <PageFrame>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading this visit</span>
          <Skeleton className="h-64 w-full" />
        </div>
      </PageFrame>
    );
  }

  if (planQuery.error !== null && planQuery.error !== undefined) {
    return (
      <PageFrame>
        <AccessRefusal
          error={planQuery.error}
          attempting="see this visit"
          supportAction={supportAction}
          onRetry={() => void planQuery.refetch()}
          inline={false}
        />
      </PageFrame>
    );
  }

  if (row === null) {
    // A visit id that is not on this plan. Not an error worth a refusal panel:
    // the likeliest cause is a stale link to a slot that was released, and the
    // useful thing on the screen is the way back to the ones that exist.
    return (
      <PageFrame>
        <EmptyState
          title="We could not find that visit"
          description="It may have been cancelled, or the slot may have gone back. Your other visits are on the request."
          action={
            <Link href={requestHref(requirementId)}>
              <Button variant="outline">Back to your request</Button>
            </Link>
          }
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <VisitBreadcrumb requirementId={requirementId} position={row.position} planSize={tracker?.planSize ?? 1} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
      <VisitHeader row={row} planSize={tracker?.planSize ?? 1} />

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

      {/* The money, as an answer rather than a paragraph. */}
      <VisitMoneyCard row={row} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
      <ArrivalCodePanel
        code={codeQuery.data ?? null}
        isLoading={codeQuery.isPending && codeQuery.fetchStatus !== "idle"}
        onIssue={() => issueCode.mutate({ siteVisitId })}
        isIssuing={issueCode.isPending}
        issueError={issueCode.error}
        supportAction={supportAction}
      />

      <VisitCommands
        row={row}
        onReportNoShow={(visitId) =>
          // The reason code is fixed rather than collected. The Customer already
          // confirmed the one fact that matters — nobody turned up — and asking
          // them to classify it would be collecting a taxonomy nothing publishes.
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
        </aside>
      </div>
    </PageFrame>
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

/** A stable page width, with the visit record and arrival-code rail side by side. */
function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:pb-12">{children}</div>
  );
}

const STATE_BADGE: Record<
  VisitSlotRow["state"],
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  awaiting: { label: "Waiting for a professional", tone: "neutral" },
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
}: {
  row: VisitSlotRow;
  planSize: number;
}) {
  const badge = STATE_BADGE[row.state] ?? STATE_BADGE.awaiting;
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);

  const day = calendarDay(row.scheduledFor, row.timeZone);

  return (
    // The way back is the breadcrumb above this, not a second link inside the
    // card. Two of them on one screen is two answers to one question.
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
        {/* The date as an object rather than a clause. This screen is opened on
            the morning of the visit as often as any other time, and "when" is
            the first question it should answer without being read. Absent until
            a professional has taken the slot — a tile printing a day nobody has
            agreed to would be the invented fact this codebase forbids. */}
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
          <h1 className="text-lg font-extrabold tracking-tight text-text">
            {when ?? "No time confirmed yet"}
          </h1>
          <p className="text-sm font-medium text-text-secondary">
            Visit {row.position} of {planSize}
          </p>
        </div>

        <Badge tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      </div>
    </header>
  );
}

/**
 * What has happened and what is next, in four lines.
 *
 * Derived entirely from the row's own state rather than from a server timeline:
 * this is the plan's arithmetic, not the requirement's audit trail, and the
 * requirement already has a real timeline of its own on the request page.
 *
 * The last step is the estimate deadline, because that is the thing the plan
 * actually bought and the thing a Customer is waiting on once the vendor drives
 * away. It is the one step whose absence is meaningful — a null
 * `estimateDueAt` is an owner policy that is unset, not time in hand — so it
 * says so rather than rendering a date nobody set.
 */
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
        {/* Not the visit time — that is the *next* step, and printing it on both
            made the first two rows look like the same event twice. What this
            step actually reports is that somebody took the slot, so it says who.
            The plan read publishes no acceptance timestamp, and inventing one
            from the visit time is exactly the duplication this replaced. */}
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

/**
 * The visit-day no-show command, and the reason it is down here.
 *
 * "They did not come" refunds a share and marks a real person's standing, and it
 * used to sit inline on a list beside four other rows. Here it is the last thing
 * on a page somebody has deliberately opened, kept quiet, and still behind a
 * confirmation that states the consequence before the press.
 */
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
    // `items-start` so each control is the width of its own label. In a plain
    // column a `ghost` button stretches edge to edge, and a borderless full-width
    // one stops reading as a control at all — on the screenshot that reported
    // this, "They did not turn up" looked like a stray centred sentence.
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

/**
 * Where this visit sits, as a trail rather than a back link.
 *
 * A single "Back to your request" answers one question — how do I leave — and
 * none of the others. On a page reached from a notification months later, the
 * useful facts are which job this belongs to and which of its visits this is,
 * and a trail states both while still being the way out.
 */
function VisitBreadcrumb({
  requirementId,
  position,
  planSize,
}: {
  requirementId: string;
  position: number;
  planSize: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.history.back();
        }}
        aria-label="Go back"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-text shadow-2xs transition-colors hover:bg-surface-hover hover:text-text-primary active:scale-95 cursor-pointer"
      >
        <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
      </button>
      <nav aria-label="Breadcrumb">
        <ol className="flex list-none flex-wrap items-center gap-2 p-0 text-sm font-medium text-text-secondary">
          <li>
            <Link href="/activity" className="hover:text-text hover:underline">
              Bookings
            </Link>
          </li>
          <li aria-hidden className="text-warm-400">
            /
          </li>
          <li>
            <Link href={requestHref(requirementId)} className="hover:text-text hover:underline">
              Your request
            </Link>
          </li>
          <li aria-hidden className="text-warm-400">
            /
          </li>
          <li className="font-bold text-text" aria-current="page">
            Visit {position} of {planSize}
          </li>
        </ol>
      </nav>
    </div>
  );
}

/**
 * What this slot's money is doing: the answer, then the account.
 *
 * "Where is my ₹499" is a glance; "why is it there and when does it move" is a
 * read, and the two do not deserve the same weight. The summary and the
 * sentence are the same server figures — see `slotMoneySummary` for why that
 * duplication is safe.
 */
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
