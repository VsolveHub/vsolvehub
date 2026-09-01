"use client";

import { Button, EmptyState, Skeleton } from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { requestHref } from "@/lib/routes";

import { toVisitTrackerView } from "../adapters";
import { useVisitPlan } from "../queries";
import { AccessRefusal } from "./access-refusal";
import { VisitDetailAside, VisitDetailPrimary } from "./visit-detail-body";

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
 * A request with exactly one booked visit inlines the same body on the request
 * page, so the customer is not sent here for that case. This route still loads
 * for a bookmark, a notification, or a plan with two or more visits.
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

  const tracker =
    planQuery.data === undefined ? null : toVisitTrackerView(planQuery.data);
  const row = tracker?.rows.find((candidate) => candidate.visitId === siteVisitId) ?? null;

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
        <VisitDetailPrimary
          row={row}
          planSize={tracker?.planSize ?? 1}
          requirementId={requirementId}
          supportAction={supportAction}
        />

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <VisitDetailAside
            row={row}
            requirementId={requirementId}
            supportAction={supportAction}
          />
        </aside>
      </div>
    </PageFrame>
  );
}

/** A stable page width, with the visit record and arrival-code rail side by side. */
function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:pb-12">{children}</div>
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
