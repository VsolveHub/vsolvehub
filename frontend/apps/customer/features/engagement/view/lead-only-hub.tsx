"use client";

import { toRateTermsView } from "@/features/crew/adapters";
import { RateTermsLink } from "@/features/crew/view/rate-terms-sheet";
import { toShiftDayView, type ShiftDayView } from "@/features/shift-day/adapters";
import { useShiftDay } from "@/features/shift-day/queries";
import { NotRightSheet } from "@/features/shift-day/view/not-right-sheet";
import { describeError } from "@vsolve/query";
import { EmptyState, ErrorState, Sheet, Skeleton, Timeline, TimelineEvent, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { BookingSupport } from "@/features/support/view/booking-support";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import { bookCrewHref, receiptHref } from "@/lib/routes";

import { toAmendmentsView, toEngagementEvents, type AmendmentView, type EngagementView, type StageView } from "../adapters";
import { leadOnlyHubPhase } from "../model/booking-record";
import { useEngagementAmendments, useEngagementEvents } from "../queries";
import { CompletionPanel } from "./completion-panel";
import { DayChips } from "./day-chips";
import { EngagementStatusBadge, nounsFor } from "./engagement-status";
import { ProblemSheet } from "./problem-sheet";
import { Receipt } from "./receipt";
import { TodayCard } from "./today-card";

/**
 * The A3 booking hub — `/jobs/{id}` for `lead_only` engagements, screen 5.
 *
 * Everything the request-review, the money breakdown, the stage list and the
 * completion panel used to say for a workforce booking is said once here: a
 * header contact card, the day chips, one live `TodayCard` for whichever day
 * needs an answer, the money said once, the address, a Problem button, and
 * three links — Receipt, History, Rate & terms — at the bottom. The A5/managed
 * branch of `EngagementScreen` never reaches this component.
 */

export interface LeadOnlyHubProps {
  view: EngagementView;
  onRefresh: () => void;
}

export function LeadOnlyHub({ view, onRefresh }: LeadOnlyHubProps) {
  const amendmentsQuery = useEngagementAmendments(view.engagementId);
  const amendments = amendmentsQuery.data === undefined ? null : toAmendmentsView(amendmentsQuery.data);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [notRightDay, setNotRightDay] = useState<ShiftDayView | null>(null);

  const phase = leadOnlyHubPhase(view.status);
  const isDone = phase === "done";
  const isCompleting = phase === "completion";
  const activeDay = isDone || isCompleting ? null : firstUnsettledDay(view.stages);
  const terms = view.crewTerms === null ? null : toRateTermsView(view.crewTerms);
  const liveAmendment = amendments === null ? null : amendments.live;
  const pendingAmendmentForDay =
    activeDay === null || liveAmendment === null ? null : liveAmendmentForDay(liveAmendment, activeDay.stageId);

  return (
    <div className="flex flex-col gap-4">
      <HubHeader view={view} />

      {view.stages.length > 0 ? (
        <section aria-label="Days">
          <DayChips engagementId={view.engagementId} days={view.stages} />
        </section>
      ) : null}

      {isCompleting ? (
        <CompletionPanel
          engagement={view}
          project={null}
          nouns={nounsFor(view.mode)}
          onDone={onRefresh}
          embedded
        />
      ) : isDone ? (
        <DoneCard view={view} />
      ) : activeDay !== null ? (
        <section aria-label={`Today · ${activeDay.label}`}>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
            Today · {activeDay.scheduledOn ?? activeDay.label}
          </p>
          <TodayCard
            engagementId={view.engagementId}
            requirementId={view.requirementId}
            day={activeDay}
            pendingAmendment={pendingAmendmentForDay}
            onDone={onRefresh}
            onNotRight={setNotRightDay}
          />
        </section>
      ) : (
        <EmptyState title="Nothing due today" compact description="Check the days above for what is next." />
      )}

      {view.accessReceipt !== null ? (
        <Receipt engagementId={view.engagementId} variant="inline" />
      ) : terms !== null ? (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm text-text">
              {terms.leadDayReceiptLabel} a day to the crew
              {view.accessReceipt !== null ? ` · ${view.accessReceipt.amountLabel} fee paid ✓` : ""}
            </p>
          </div>
          <RateTermsLink terms={terms} />
        </section>
      ) : null}

      {view.siteAddress !== null ? (
        <section className="flex items-start gap-2 text-sm text-text-secondary">
          <span aria-hidden>📍</span>
          <span>{view.siteAddress.summary}</span>
        </section>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setProblemOpen(true)}
          className="text-sm font-semibold text-danger-text underline underline-offset-2"
        >
          ⚠ Problem
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
        <Link href={receiptHref(view.engagementId)} className="font-semibold text-text-link underline underline-offset-2">
          Payment record
        </Link>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="font-semibold text-text-link underline underline-offset-2"
        >
          History
        </button>
        {terms !== null ? <RateTermsLink terms={terms} /> : null}
      </div>

      <BookingSupport reference={view.engagementId} />

      <div className="mt-2">
        <CompletionRating subject="engagement" id={view.engagementId} isComplete={isDone} />
      </div>

      <HistorySheet
        engagementId={view.engagementId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      <ProblemSheet
        open={problemOpen}
        onOpenChange={setProblemOpen}
        engagementId={view.engagementId}
        requirementId={view.requirementId}
        firstDayStageId={view.stages[0]?.stageId ?? null}
        canRecordFirstDay={activeDay !== null && activeDay.position === 1}
        onDone={() => {
          setProblemOpen(false);
          onRefresh();
        }}
      />

      {notRightDay !== null ? (
        <NotRightDaySheet
          engagementId={view.engagementId}
          shift={notRightDay}
          onClose={() => setNotRightDay(null)}
          onDone={() => {
            setNotRightDay(null);
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The picked day's own `useShiftDay` read, refetched fresh for the sheet so a
 * confirm elsewhere while the sheet is open never disputes a stale count.
 */
function NotRightDaySheet({
  engagementId,
  shift,
  onClose,
  onDone,
}: {
  engagementId: string;
  shift: ShiftDayView;
  onClose: () => void;
  onDone: () => void;
}) {
  const dayQuery = useShiftDay(engagementId, shift.stageId, true);
  const live = dayQuery.data === undefined ? shift : toShiftDayView(dayQuery.data);

  return (
    <NotRightSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      engagementId={engagementId}
      day={live}
      amendmentHref="#amendments"
      onDone={onDone}
    />
  );
}

function firstUnsettledDay(stages: readonly StageView[]): StageView | null {
  const ordered = [...stages].sort((left, right) => left.position - right.position);
  const open = ordered.find((stage) => {
    const chipState = stage.shiftSummary?.chip.state ?? null;
    return chipState !== "paid" && stage.status !== "CANCELLED";
  });
  return open ?? ordered[ordered.length - 1] ?? null;
}

function liveAmendmentForDay(amendment: AmendmentView, stageId: string): AmendmentView | null {
  return amendment.stageId === stageId ? amendment : null;
}

function HubHeader({ view }: { view: EngagementView }) {
  return (
    <header>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">{view.serviceName ?? "Your booking"}</h1>
        <EngagementStatusBadge status={view.status} />
      </div>

      {view.partnerContact !== null ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
          <div className="min-w-0">
            <p className="font-semibold text-text">👷 {view.partnerContact.name} · supervisor</p>
            {view.partnerContact.phone !== "" ? (
              <p className="mt-0.5 text-sm text-text-secondary">📞 {view.partnerContact.phone}</p>
            ) : null}
          </div>
          {view.partnerContact.phone !== "" ? (
            <a href={view.partnerContact.telHref} className={buttonStyles({ variant: "primary", size: "sm" })}>
              Call
            </a>
          ) : null}
        </div>
      ) : view.contactReleasedAt !== null ? (
        <p className="mt-2 text-sm text-text-secondary">You can contact each other from {view.contactReleasedAt}.</p>
      ) : null}
    </header>
  );
}

function DoneCard({ view }: { view: EngagementView }) {
  return (
    <section className="rounded-card border border-success-line bg-success-surface p-4">
      <h2 className="font-semibold text-text">✅ Done · {view.serviceName ?? "Your booking"}</h2>
      <ul className="mt-3 flex list-none flex-col gap-1 p-0">
        {view.stages.map((stage) => (
          <li key={stage.stageId} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-text">{stage.label}</span>
            <span className="text-text">
              {stage.shiftSummary?.chip.label ?? stage.amountLabel}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-success-line pt-3 text-sm">
        {/* The server's own published total — never re-summed from per-day
            settlement labels, which are formatted strings and not numbers. */}
        {view.crewTerms !== null ? (
          <div className="flex items-baseline justify-between">
            <span className="text-text">Paid to crew</span>
            <span data-numeric className="font-semibold text-text">
              {view.crewTerms.leadReceiptLabel}
            </span>
          </div>
        ) : null}
        {view.accessReceipt !== null ? (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-text">Booking fee (Vsolve)</span>
            <span className="flex items-center gap-2">
              <span data-numeric className="font-semibold text-text">
                {view.accessReceipt.amountLabel}
              </span>
              <Link href={receiptHref(view.engagementId)} className="text-text-link underline underline-offset-2">
                Payment record
              </Link>
            </span>
          </div>
        ) : null}
      </div>
      {view.serviceSlug !== null ? (
        <div className="mt-4">
          <Link
            href={bookCrewHref(view.serviceSlug)}
            className={buttonStyles({ variant: "outline", className: "w-full sm:w-auto" })}
          >
            Book {view.partnerContact?.name ?? "this crew"} again
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The "History" link's sheet — every event on this booking, in one
 * chronological record. Same read and the same honesty rule
 * `EngagementTimeline` states: nothing here is synthesised, and a failed read
 * says so rather than guessing.
 */
function HistorySheet({
  engagementId,
  open,
  onOpenChange,
}: {
  engagementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useEngagementEvents(open ? engagementId : null);
  const events = query.data === undefined ? null : toEngagementEvents(query.data);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="History">
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the record</span>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : events === null ? (
        (() => {
          const presentation = describeError(query.error, "read");
          return (
            <ErrorState
              title={presentation.title}
              message={presentation.message}
              severity={presentation.severity}
              actionLabel="Try again"
              onAction={() => void query.refetch()}
              reference={presentation.reference}
              inline
            />
          );
        })()
      ) : events.length === 0 ? (
        <EmptyState title="Nothing has happened yet" compact description="Every step on this booking is recorded here as it happens." />
      ) : (
        <Timeline label="Everything that has happened on this booking">
          {events.map((event) => (
            <TimelineEvent
              key={event.eventId}
              title={event.title}
              timestamp={event.at ?? ""}
              actor={event.actorIsSystem ? "Automatic — no one had to do anything" : "Somebody decided this"}
            >
              {event.transition !== null ? event.transition : null}
            </TimelineEvent>
          ))}
        </Timeline>
      )}
    </Sheet>
  );
}
