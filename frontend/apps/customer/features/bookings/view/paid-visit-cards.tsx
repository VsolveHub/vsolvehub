"use client";

import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { Money } from "@/features/checkout/view/money";
import { canRespondToCompletion, useVisit, type VisitStatus } from "@/features/visit/queries";
import { CompletionDecision } from "@/features/visit/view/completion-decision";
import { VisitActions } from "@/features/visit/view/visit-actions";
import { bookingVisitHref } from "@/lib/routes";

import { newestBookingStatus, type BookingGroup, type FulfilmentUnit } from "../queries";
import {
  cleanServiceLabel,
  formatBookingDate,
  formatBookingTime,
  formatBookingWhen,
  linePresentationLabel,
  serviceLinesOf,
} from "./booking-format";
import { UnitStatusBadge } from "./group-status";
import { MockProfessionalCard } from "./mock-professional-card";
import { ProfessionalCard } from "./professional-card";
import { VisitProgress } from "./visit-progress";
import { showsStartCode, VisitStartCode } from "./visit-start-code";

/**
 * Where this visit has got to, from whichever read the page holds is newer.
 *
 * `useVisit` is the same cached query the start-code card and the visit actions
 * already read, so this adds no request — it only stops the track and the code
 * waiting on the group read when the visit read has already moved on.
 */
function useLiveBookingStatus(unit: FulfilmentUnit, groupReadAt: number): VisitStatus | null {
  const visit = useVisit(unit.booking_id);
  return newestBookingStatus(
    { status: unit.booking_status, readAt: groupReadAt },
    visit.data === undefined ? null : { status: visit.data.status, readAt: visit.dataUpdatedAt },
  );
}

function ProfessionalBlock({ unit, isPaid }: { unit: FulfilmentUnit; isPaid: boolean }) {
  if (unit.professional && isPaid) {
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

  if (unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING") {
    return <MockProfessionalCard professional={unit.professional} />;
  }

  return null;
}

function RecoveryNote({ unit }: { unit: FulfilmentUnit }) {
  if (unit.status !== "RECOVERY_REQUIRED") return null;
  return (
    <p className="mt-3 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
      Your professional had to step back. We are assigning someone else now — if we cannot,
      this visit is cancelled and refunded in full automatically.
    </p>
  );
}

function ScheduleBlock({ unit }: { unit: FulfilmentUnit }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Date</dt>
        <dd className="mt-0.5 font-medium text-text">
          <time dateTime={unit.starts_at}>{formatBookingDate(unit.starts_at)}</time>
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Time</dt>
        <dd className="mt-0.5 font-medium text-text">
          <time dateTime={unit.starts_at}>{formatBookingTime(unit.starts_at)}</time>
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Arrival window
        </dt>
        <dd className="mt-0.5 font-medium text-text">{unit.arrival_window_minutes} min</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Estimated work
        </dt>
        <dd className="mt-0.5 font-medium text-text">about {unit.estimated_duration_minutes} min</dd>
      </div>
    </dl>
  );
}

/** Left column of a one-visit paid booking. */
export function SingleVisitDetailCard({
  unit,
  isPaid,
  groupReadAt,
}: {
  unit: FulfilmentUnit;
  isPaid: boolean;
  /** When the group read this unit came from was fetched (`dataUpdatedAt`). */
  groupReadAt: number;
}) {
  const services = serviceLinesOf(unit);
  const bookingStatus = useLiveBookingStatus(unit, groupReadAt);

  return (
    <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Your visit</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Confirmed for <time dateTime={unit.starts_at}>{formatBookingWhen(unit.starts_at)}</time>
          </p>
        </div>
        <UnitStatusBadge unit={unit} />
      </div>

      {/* `VisitProgress` draws its own card and nothing at all outside the journey, so it is not
          wrapped: an outer box here was the empty grey panel left on a finished visit. */}
      {bookingStatus ? <VisitProgress status={bookingStatus} /> : null}

      {unit.booking_id && bookingStatus && showsStartCode(bookingStatus) ? (
        <div className="rounded-xl border border-orange-200/80 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-orange-950 mb-2">
            🔐 Start Code for Visit
          </p>
          <VisitStartCode bookingId={unit.booking_id} status={bookingStatus} />
        </div>
      ) : null}

      <section className="space-y-2" aria-labelledby="visit-professional">
        <h3 id="visit-professional" className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Assigned Professional
        </h3>
        <ProfessionalBlock unit={unit} isPaid={isPaid} />
      </section>

      <RecoveryNote unit={unit} />

      {services.length > 0 ? (
        <section className="space-y-2" aria-labelledby="visit-service">
          <h3 id="visit-service" className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Booked Services ({services.length})
          </h3>
          <ul className="divide-y divide-line/40 rounded-xl border border-line/60 bg-surface-sunken/30 p-3">
            {services.map((line) => {
              const cleanLabel = cleanServiceLabel(line.label, line.quantity);
              return (
                <li key={line.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-medium text-slate-800">
                    {cleanLabel}
                    {line.quantity > 1 ? (
                      <span className="ml-1.5 inline-flex items-center rounded-md bg-warm-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        Qty: {line.quantity}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    <Money value={line.amount} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-line pt-4" aria-labelledby="visit-schedule">
        <h3 id="visit-schedule" className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
          Schedule & Timing
        </h3>
        <ScheduleBlock unit={unit} />
      </section>

      {unit.booking_id ? <SingleVisitLiveActions bookingId={unit.booking_id} /> : null}
    </article>
  );
}

function SingleVisitLiveActions({ bookingId }: { bookingId: string }) {
  const visit = useVisit(bookingId);
  if (visit.data === undefined) return null;
  return (
    <>
      {/* The Partner's report waits on this answer; this is the screen a one-visit booking
          opens on, so the answer has to be here and not only on the visit page. */}
      {canRespondToCompletion(visit.data) ? <CompletionDecision visit={visit.data} /> : null}
      <VisitActions visit={visit.data} />
    </>
  );
}

/** Compact card on a multi-visit paid overview. */
export function MultiVisitOverviewCard({
  unit,
  index,
  total,
  groupId,
  isPaid,
  groupReadAt,
}: {
  unit: FulfilmentUnit;
  index: number;
  total: number;
  groupId: string;
  isPaid: boolean;
  /** When the group read this unit came from was fetched (`dataUpdatedAt`). */
  groupReadAt: number;
}) {
  const services = serviceLinesOf(unit);
  const bookingStatus = useLiveBookingStatus(unit, groupReadAt);

  return (
    <li className="rounded-2xl border border-line bg-surface shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Visit Card Top Header */}
      <div className="bg-surface-sunken/60 border-b border-line/60 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white shadow-xs">
            {index + 1}
          </span>
          <h3 className="text-base font-bold text-navy-900">
            Visit {index + 1} of {total}
          </h3>
        </div>
        <UnitStatusBadge unit={unit} />
      </div>

      <div className="p-5 space-y-4">
        {/* Schedule Highlights */}
        <div className="rounded-xl border border-line/70 bg-surface-sunken/40 p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0 p-1.5 rounded-lg bg-orange-50">📅</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-text-secondary text-[10px]">Date & Time</p>
              <p className="font-semibold text-text text-xs sm:text-sm mt-0.5">
                <time dateTime={unit.starts_at}>{formatBookingWhen(unit.starts_at)}</time>
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0 p-1.5 rounded-lg bg-blue-50">⏱️</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-text-secondary text-[10px]">Arrival Window</p>
              <p className="font-semibold text-text text-xs sm:text-sm mt-0.5">{unit.arrival_window_minutes} min</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0 p-1.5 rounded-lg bg-emerald-50">⏳</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-text-secondary text-[10px]">Estimated Work</p>
              <p className="font-semibold text-text text-xs sm:text-sm mt-0.5">about {unit.estimated_duration_minutes} min</p>
            </div>
          </div>
        </div>

        {/* Start Code (OTP) if active */}
        {unit.booking_id && bookingStatus && showsStartCode(bookingStatus) ? (
          <div className="rounded-xl border border-orange-200/80 bg-orange-50/50 p-4">
            <p className="text-xs font-semibold text-orange-950 mb-2">
              🔐 Start Code for Visit {index + 1}
            </p>
            <VisitStartCode bookingId={unit.booking_id} status={bookingStatus} />
          </div>
        ) : null}

        {/* Professional Block */}
        <div className="rounded-xl border border-line/70 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-2">
            Professional
          </p>
          <ProfessionalBlock unit={unit} isPaid={isPaid} />
        </div>

        <RecoveryNote unit={unit} />

        {/* Booked Services */}
        {services.length > 0 ? (
          <div className="rounded-xl border border-line/70 bg-white p-4">
            <div className="flex items-center justify-between border-b border-line/50 pb-2 mb-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                Booked Services ({services.length})
              </p>
            </div>
            <ul className="divide-y divide-line/40">
              {services.map((line) => {
                const cleanLabel = cleanServiceLabel(line.label, line.quantity);
                return (
                  <li key={line.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-slate-800">
                      {cleanLabel}
                      {line.quantity > 1 ? (
                        <span className="ml-1.5 inline-flex items-center rounded-md bg-warm-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          Qty: {line.quantity}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      <Money value={line.amount} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {unit.booking_id && bookingStatus === "COMPLETION_SUBMITTED" ? (
          <p className="rounded-xl border border-warning-line bg-warning-surface p-3 text-sm font-semibold text-text">
            The work on this visit is reported done. Open it to confirm, or to tell us what is wrong.
          </p>
        ) : null}

        {/* Card Action Link */}
        {unit.booking_id ? (
          <div className="pt-2">
            <Link
              href={bookingVisitHref(groupId, unit.booking_id)}
              prefetch={false}
              className={buttonStyles({
                variant: "outline",
                className: "w-full sm:w-auto justify-center font-bold px-5 text-sm border-line hover:border-orange-600 hover:text-orange-600 gap-1.5 shadow-2xs",
              })}
            >
              <span>View details</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PaymentLineRow({ line }: { line: FulfilmentUnit["lines"][number] }) {
  const baseLabel = linePresentationLabel(line);
  const cleanLabel = cleanServiceLabel(baseLabel, line.quantity);
  return (
    <li className="flex justify-between items-start gap-3 text-xs">
      <span className="text-text-secondary">
        {cleanLabel}
        {line.kind === "SERVICE" && line.quantity > 1 ? (
          <span className="font-medium text-text"> × {line.quantity}</span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums font-medium text-text">
        <Money value={line.amount} />
      </span>
    </li>
  );
}

function ReceiptLink({ groupId, orderId }: { groupId: string; orderId: string | null }) {
  if (orderId === null) return null;
  return (
    <Link
      href={`/bookings/${groupId}/receipt`}
      className={`${buttonStyles({
        className: "w-full justify-center h-11 text-sm font-bold bg-navy-900 hover:bg-navy-800 text-white shadow-xs gap-1.5",
      })}`}
    >
      <span>📄</span>
      <span>View your receipt</span>
    </Link>
  );
}

/** Right-column payment summary for one paid visit. */
export function PaidVisitPaymentCard({
  unit,
  groupId,
  orderId,
}: {
  unit: FulfilmentUnit;
  groupId: string;
  orderId: string | null;
}) {
  const displayLines = unit.lines.filter(
    (line) => (line.amount?.amount_paise ?? 0) > 0 || line.kind === "SERVICE",
  );
  return (
    <aside className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm space-y-5 max-h-[calc(100vh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">
            Payment summary
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">Paid in full</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
          ✓ Paid
        </span>
      </div>
      <ul className="space-y-2 text-sm">
        {displayLines.map((line) => (
          <PaymentLineRow key={line.id} line={line} />
        ))}
      </ul>
      <div className="rounded-xl bg-orange-50/70 border border-orange-200/60 p-4 flex items-baseline justify-between">
        <span className="text-xs font-bold text-orange-950 uppercase tracking-wide">Visit total</span>
        <span className="text-2xl font-black text-navy-950 tabular-nums">
          <Money value={unit.total} />
        </span>
      </div>
      <ReceiptLink groupId={groupId} orderId={orderId} />
      <div className="pt-3 border-t border-line/60 space-y-2 text-[11px] text-text-secondary">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-bold">🔒</span>
          <span>Paid securely via Razorpay</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-bold">🛡️</span>
          <span>100% money back guarantee on cancellation</span>
        </div>
      </div>
    </aside>
  );
}

/** Right-column payment summary for a paid multi-visit booking. */
export function PaidGroupPaymentCard({ group }: { group: BookingGroup }) {
  const currency = group.units[0]?.total.currency ?? "INR";
  const totalPaise = group.units.reduce((sum, unit) => sum + unit.total.amount_paise, 0);

  return (
    <aside className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm space-y-5 max-h-[calc(100vh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">
            Payment summary
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Paid in full
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
          ✓ Paid
        </span>
      </div>

      <div className="space-y-3">
        {group.units.map((unit, index) => {
          // Omit zero-amount adjustments like "Minimum visit charge ₹0"
          const displayLines = unit.lines.filter(
            (line) => (line.amount?.amount_paise ?? 0) > 0 || line.kind === "SERVICE",
          );
          return (
            <div
              key={unit.id}
              className="rounded-xl border border-line/60 bg-surface-sunken/60 p-3.5 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between font-semibold text-text border-b border-line/40 pb-1.5">
                <span className="text-action font-bold">Visit {index + 1}</span>
                <span className="text-[11px] text-text-secondary font-normal">
                  {unit.arrival_window_minutes} min window
                </span>
              </div>
              <ul className="space-y-1.5 text-text">
                {displayLines.map((line) => (
                  <PaymentLineRow key={line.id} line={line} />
                ))}
              </ul>
              <div className="flex justify-between items-baseline pt-1.5 border-t border-line/40 font-semibold text-text">
                <span className="text-text-secondary">Visit {index + 1} total</span>
                <span className="tabular-nums font-bold">
                  <Money value={unit.total} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grand Total */}
      <div className="rounded-xl bg-orange-50/70 border border-orange-200/60 p-4 flex items-baseline justify-between">
        <div>
          <span className="text-xs font-bold text-orange-950 uppercase tracking-wide">Booking total</span>
          <p className="text-[11px] text-orange-800">Taxes & fees included</p>
        </div>
        <span className="text-2xl font-black text-navy-950 tabular-nums">
          <Money
            value={{ amount_paise: totalPaise, currency }}
          />
        </span>
      </div>

      <ReceiptLink groupId={group.id} orderId={group.order_id} />

      {/* Trust & Guarantee */}
      <div className="pt-3 border-t border-line/60 space-y-2 text-[11px] text-text-secondary">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-bold">🔒</span>
          <span>Paid securely via Razorpay</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-bold">🛡️</span>
          <span>100% money back guarantee on cancellation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-bold">💬</span>
          <span>24/7 customer support available</span>
        </div>
      </div>
    </aside>
  );
}
