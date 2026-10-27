"use client";

import { Badge, Button, Card, ErrorState, Spinner, buttonStyles, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { useBookingGroup, type FulfilmentUnit } from "@/features/bookings/queries";
import {
  formatBookingDate,
  formatBookingTime,
  serviceLinesOf,
} from "@/features/bookings/view/booking-format";
import { PaidVisitPaymentCard } from "@/features/bookings/view/paid-visit-cards";
import { ProfessionalCard } from "@/features/bookings/view/professional-card";
import { UnitStatusBadge } from "@/features/bookings/view/group-status";
import { MockProfessionalCard } from "@/features/bookings/view/mock-professional-card";
import { VisitProgress } from "@/features/bookings/view/visit-progress";
import { VisitStartCode } from "@/features/bookings/view/visit-start-code";
import { Money } from "@/features/checkout/view/money";
import {
  isVisitWorkComplete,
  VisitFeedbackForm,
} from "@/features/ratings/view/visit-feedback-form";
import { BookingSupport } from "@/features/support/view/booking-support";

import {
  canRequestStartOtp,
  canRespondToCompletion,
  useConfirmCompletion,
  useDisputeCompletion,
  useRequestStartOtp,
  useVisit,
  type Visit,
} from "../queries";
import { VisitActions } from "./visit-actions";
import { VISIT_STATUS_DESCRIPTIONS, VisitStatusBadge } from "./visit-status";

/**
 * Confirm and Report sit side by side.
 *
 * A completion report offers exactly two answers and neither is the default.
 * Making Confirm the prominent one and Report a quiet link would be the platform
 * nudging a customer past a problem it has an interest in not hearing about.
 *
 * Nothing here claims an outcome before the server does. Every mutation re-reads.
 * An ambiguous failure leaves the panel showing what Django last said plus an
 * honest error, never an optimistic transition.
 */

function VisitTasksPaymentCard({ visit }: { visit: Visit }) {
  if (visit.work_tasks.length === 0) return null;

  const currency = visit.work_tasks[0]?.currency ?? "INR";
  const totalPaise = visit.work_tasks.reduce((sum, task) => sum + task.amount_paise, 0);

  return (
    <aside className="rounded-card border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-24">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Payment summary
      </h2>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {visit.work_tasks.map((task) => (
          <li key={task.id} className="flex justify-between gap-3">
            <span className="text-text-secondary">
              {task.label}
              {task.quantity > 1 ? ` × ${task.quantity}` : ""}
              {task.kind === "AMENDMENT" ? (
                <Badge tone="action" className="ml-2">
                  Added
                </Badge>
              ) : null}
            </span>
            <span data-numeric className="shrink-0 tabular-nums text-text">
              {formatMoney(task.amount_paise)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold text-text">
        <span>Visit total</span>
        <Money
          value={{ amount_paise: totalPaise, currency }}
          className="tabular-nums"
        />
      </p>
    </aside>
  );
}

function StartCodePrompt({ visit }: { visit: Visit }) {
  const requestOtp = useRequestStartOtp();
  const [requested, setRequested] = useState(false);

  return (
    <section aria-labelledby="visit-start-code" className="mt-6 rounded-control bg-surface-sunken p-4">
      <h3 id="visit-start-code" className="text-sm font-semibold text-text">
        Your start code
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        We will text you a {requestOtp.data?.code_length ?? 4}-digit code. Read it out to your
        professional so they can start — it is how we confirm the right person is at your door.
      </p>
      {requestOtp.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not send the code"
          message="Nothing has changed. Try again in a moment."
        />
      ) : null}
      <Button
        className="mt-3"
        variant={requested ? "outline" : "primary"}
        loading={requestOtp.isPending}
        loadingLabel="Sending"
        onClick={() =>
          requestOtp.mutate(
            { bookingId: visit.id, expectedVersion: visit.version },
            { onSuccess: () => setRequested(true) },
          )
        }
      >
        {requested ? "Send again" : "Send my start code"}
      </Button>
    </section>
  );
}

function CompletionDecision({ visit }: { visit: Visit }) {
  const confirm = useConfirmCompletion();
  const dispute = useDisputeCompletion();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = confirm.isPending || dispute.isPending;

  return (
    <section aria-labelledby="visit-completion" className="mt-6 rounded-control border border-line p-4">
      <h3 id="visit-completion" className="text-sm font-semibold text-text">
        Your professional says the work is done
      </h3>
      {visit.completion?.notes ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{visit.completion.notes}</p>
      ) : null}

      {confirm.isError || dispute.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not record that"
          message="Nothing has changed. We have re-checked the visit — try again."
        />
      ) : null}

      {reporting ? (
        <div className="mt-3">
          <label htmlFor="dispute-reason" className="text-sm font-semibold text-text">
            What is wrong?
          </label>
          <textarea
            id="dispute-reason"
            className="mt-1 min-h-24 w-full rounded-control border border-line bg-surface p-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={240}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              disabled={reason.trim().length === 0 || busy}
              loading={dispute.isPending}
              loadingLabel="Sending"
              onClick={() =>
                dispute.mutate({
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  disputeReason: reason.trim(),
                })
              }
            >
              Send report
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setReporting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        // Equal weight on purpose. A quiet "report a problem" link beside a
        // prominent Confirm is a nudge past a problem, not a choice.
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            loading={confirm.isPending}
            loadingLabel="Confirming"
            disabled={busy}
            onClick={() =>
              confirm.mutate({ bookingId: visit.id, expectedVersion: visit.version })
            }
          >
            Confirm it is done
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setReporting(true)}>
            Report a problem
          </Button>
        </div>
      )}
    </section>
  );
}

function ProfessionalBlock({
  unit,
  isPaid,
  partnerDisplayName,
}: {
  unit: FulfilmentUnit | null;
  isPaid: boolean;
  partnerDisplayName: string | null;
}) {
  if (unit !== null && unit.professional && isPaid) {
    return (
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <span>✓</span>
          <span>Real Partner Details Unlocked</span>
        </div>
        <ProfessionalCard professional={unit.professional} embedded />
      </div>
    );
  }

  if (
    unit !== null &&
    (unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING")
  ) {
    return <MockProfessionalCard professional={unit.professional} />;
  }

  if (partnerDisplayName) {
    return <p className="text-sm font-semibold text-text">{partnerDisplayName}</p>;
  }

  return (
    <p className="text-sm text-text-secondary">
      Your professional will appear here once they are assigned.
    </p>
  );
}

export function VisitPanel({
  bookingId,
  groupId,
}: {
  bookingId: string;
  groupId?: string;
}) {
  const visit = useVisit(bookingId);
  const groupQuery = useBookingGroup(groupId ?? null);

  if (visit.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this visit…
      </Card>
    );
  }

  if (visit.isError || !visit.data) {
    return (
      <ErrorState
        title="We could not load this visit"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void visit.refetch()}
      />
    );
  }

  const data = visit.data;
  const group = groupQuery.data ?? null;
  const unit = group?.units.find((candidate) => candidate.booking_id === data.id) ?? null;
  const services = unit !== null ? serviceLinesOf(unit) : [];
  const startsAt = unit?.starts_at ?? data.scheduled_start;
  const isPaid =
    group !== null &&
    (group.order_id !== null || group.status === "BOOKED" || group.status === "COMPLETED");
  const showPaymentColumn =
    unit !== null ||
    data.work_tasks.length > 0 ||
    (groupId !== undefined && groupQuery.isPending);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          showPaymentColumn
            ? "lg:grid lg:grid-cols-12 lg:gap-8 items-start space-y-4 lg:space-y-0"
            : undefined
        }
      >
        <div className={showPaymentColumn ? "lg:col-span-8 min-w-0 space-y-4" : "space-y-4"}>
          <article className="rounded-card border border-line bg-surface p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {unit !== null ? <UnitStatusBadge unit={unit} /> : <VisitStatusBadge status={data.status} />}
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {VISIT_STATUS_DESCRIPTIONS[data.status]}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <VisitProgress status={data.status} />
            </div>

            {unit?.booking_id && unit.booking_status ? (
              <div className="mt-4">
                <VisitStartCode bookingId={unit.booking_id} status={unit.booking_status} />
              </div>
            ) : null}

            {data.status === "RECOVERY_REQUIRED" ? (
              <p className="mt-4 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
                Your professional had to step back. We are assigning someone else now — if we cannot,
                this visit is cancelled and refunded in full automatically.
              </p>
            ) : (
              <section className="mt-6" aria-labelledby="visit-professional">
                <h2 id="visit-professional" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Professional
                </h2>
                <div className="mt-2">
                  {groupQuery.isPending && unit === null && !data.partner_display_name ? (
                    <p className="text-sm text-text-secondary">Loading professional details…</p>
                  ) : (
                    <ProfessionalBlock
                      unit={unit}
                      isPaid={isPaid}
                      partnerDisplayName={data.partner_display_name}
                    />
                  )}
                  {/* The server sends the number only from two hours before the
                      visit until it ends — the same window the professional gets
                      yours — so its presence is the whole rule. */}
                  {data.partner_phone ? (
                    <a
                      href={`tel:${data.partner_phone}`}
                      className={buttonStyles({ variant: "outline", className: "mt-3 w-full sm:w-auto" })}
                    >
                      Call your professional
                    </a>
                  ) : null}
                </div>
              </section>
            )}

            <section className="mt-6 border-t border-line pt-5" aria-labelledby="visit-schedule">
              <h2 id="visit-schedule" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Schedule
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Date</dt>
                  <dd className="mt-0.5 font-medium text-text">
                    <time dateTime={startsAt}>{formatBookingDate(startsAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Time</dt>
                  <dd className="mt-0.5 font-medium text-text">
                    <time dateTime={startsAt}>{formatBookingTime(startsAt)}</time>
                  </dd>
                </div>
                {unit !== null ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Arrival window
                    </dt>
                    <dd className="mt-0.5 font-medium text-text">{unit.arrival_window_minutes} min</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Estimated work
                  </dt>
                  <dd className="mt-0.5 font-medium text-text">
                    about {unit?.estimated_duration_minutes ?? data.estimated_duration_minutes} min
                  </dd>
                </div>
              </dl>
            </section>

            {unit !== null && services.length > 0 ? (
              <section className="mt-6 border-t border-line pt-5" aria-labelledby="visit-service">
                <h2 id="visit-service" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Service
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-text">
                  {services.map((line) => (
                    <li key={line.id}>
                      {line.label}
                      {line.quantity > 1 ? (
                        <span className="text-text-secondary"> × {line.quantity}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {canRequestStartOtp(data) ? <StartCodePrompt visit={data} /> : null}
            {canRespondToCompletion(data) ? <CompletionDecision visit={data} /> : null}

            <VisitActions visit={data} />
          </article>
        </div>

        {showPaymentColumn ? (
          <div className="min-w-0 lg:col-span-4">
            {unit !== null ? (
              <PaidVisitPaymentCard
                unit={unit}
                groupId={groupId ?? group?.id ?? ""}
                orderId={group?.order_id ?? null}
              />
            ) : data.work_tasks.length > 0 ? (
              <VisitTasksPaymentCard visit={data} />
            ) : (
              <aside className="rounded-card border border-line bg-surface p-5 shadow-xs">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Spinner size="sm" />
                  Loading payment summary…
                </div>
              </aside>
            )}
          </div>
        ) : null}
      </div>

      <BookingSupport reference={groupId ?? data.id} />

      {isVisitWorkComplete(data.status) ? (
        <VisitFeedbackForm bookingId={data.id} isComplete />
      ) : null}
    </div>
  );
}
