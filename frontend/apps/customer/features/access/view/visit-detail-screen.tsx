"use client";

import {
  Badge,
  Button,
  ConfirmAction,
  EmptyState,
  Skeleton,
  Timeline,
  TimelineEvent,
} from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { requestHref, requestQuotesHref } from "@/lib/routes";

import { formatVisitSlot, toVisitTrackerView, type VisitSlotRow } from "../adapters";
import {
  useConfirmVisitArrival,
  useIssueVisitArrivalCode,
  useReportVendorNoShow,
  useVisitArrivalCode,
  useVisitPlan,
} from "../queries";
import { AccessRefusal } from "./access-refusal";
import { ArrivalCodePanel } from "./arrival-code-panel";
import { SlotMoneyLine } from "./visit-money";
import { VendorIdentity } from "./vendor-identity";

/**
 * One site visit, on a page of its own.
 *
 * ## Why this page exists
 *
 * The tracker was carrying four blocks of prose and two destructive controls per
 * row, three rows deep, and it was the only place any of it could go. Everything
 * that is genuinely about *one* visit lives here now: who is coming, the arrival
 * code, what the money did, what happens next, and the two commands. The list
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
  const arrival = useConfirmVisitArrival();
  const noShow = useReportVendorNoShow();
  const issueCode = useIssueVisitArrivalCode();

  const tracker =
    planQuery.data === undefined ? null : toVisitTrackerView(planQuery.data);
  const row = tracker?.rows.find((candidate) => candidate.visitId === siteVisitId) ?? null;

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
      <VisitHeader row={row} requirementId={requirementId} planSize={tracker?.planSize ?? 1} />

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

      <ArrivalCodePanel
        code={codeQuery.data ?? null}
        isLoading={codeQuery.isPending && codeQuery.fetchStatus !== "idle"}
        onIssue={() => issueCode.mutate({ siteVisitId })}
        isIssuing={issueCode.isPending}
        issueError={issueCode.error}
        supportAction={supportAction}
      />

      <VisitProgress row={row} requirementId={requirementId} />

      <section
        aria-labelledby="visit-money-heading"
        className="rounded-card border border-line bg-surface p-4"
      >
        <h2 id="visit-money-heading" className="text-sm font-semibold text-text">
          This visit
        </h2>
        <SlotMoneyLine row={row} />
      </section>

      <VisitCommands
        row={row}
        requirementId={requirementId}
        onConfirmArrival={(visitId) => arrival.mutate({ siteVisitId: visitId, requirementId })}
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
        isPending={arrival.isPending || noShow.isPending}
      />

      <AccessRefusal
        error={arrival.error ?? noShow.error}
        attempting="update this visit"
        supportAction={supportAction}
      />
    </PageFrame>
  );
}

/**
 * The page's measure — the thing this screen was missing entirely.
 *
 * `CustomerShell` gates the session and deliberately sets no width, so every
 * screen in the flow tree owns its own container the way `QuotesScreen` does. A
 * screen that renders a bare stack instead runs edge to edge: on a desktop
 * viewport the cards touched both sides of the window and the timeline's title
 * and timestamp ended up a thousand pixels apart, reading as two unrelated
 * columns rather than one row.
 *
 * `max-w-3xl` rather than the quotes screen's `max-w-6xl`, because this is one
 * column of cards and not two, and prose set to six columns wide is unreadable
 * however well it is spaced.
 *
 * Applied to every state and not only the loaded one, so the page does not
 * change width when the data lands.
 */
function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      {children}
    </div>
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
  requirementId,
  planSize,
}: {
  row: VisitSlotRow;
  requirementId: string;
  planSize: number;
}) {
  const badge = STATE_BADGE[row.state] ?? STATE_BADGE.awaiting;
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);

  return (
    <header className="flex flex-col gap-2">
      <Link
        href={requestHref(requirementId)}
        className="text-sm font-medium text-text-link hover:underline"
      >
        Back to your request
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">
          Visit {row.position} of {planSize}
        </h1>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-sm text-text-secondary">{when ?? "No time confirmed yet"}</p>
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
 * The two visit-day commands, and the reason they are down here.
 *
 * "They did not come" refunds a share and marks a real person's standing, and it
 * used to sit inline on a list beside four other rows. Here it is the last thing
 * on a page somebody has deliberately opened, kept quiet, and still behind a
 * confirmation that states the consequence before the press.
 */
function VisitCommands({
  row,
  onConfirmArrival,
  onReportNoShow,
  isPending,
}: {
  row: VisitSlotRow;
  requirementId: string;
  onConfirmArrival: (visitId: string) => void;
  onReportNoShow: (visitId: string) => void;
  isPending: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const visitId = row.visitId;
  if (visitId === null || (!row.canConfirmArrival && !row.canReportNoShow)) return null;

  return (
    // `items-start` so each control is the width of its own label. In a plain
    // column a `ghost` button stretches edge to edge, and a borderless full-width
    // one stops reading as a control at all — on the screenshot that reported
    // this, "They did not turn up" looked like a stray centred sentence.
    <div className="flex flex-col items-start gap-2">
      {row.canConfirmArrival ? (
        <>
          <Button
            variant="outline"
            onClick={() => onConfirmArrival(visitId)}
            loading={isPending}
            loadingLabel="Confirming"
          >
            They arrived without using the code
          </Button>
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            Use this only if the code will not work — a dead phone, or no signal
            on site. We record which way each arrival was confirmed.
          </p>
        </>
      ) : null}

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
