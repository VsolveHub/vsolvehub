"use client";

import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { Money } from "@/features/checkout/view/money";
import { useVisit } from "@/features/visit/queries";
import { VisitActions } from "@/features/visit/view/visit-actions";
import { bookingVisitHref } from "@/lib/routes";

import type { BookingGroup, FulfilmentUnit } from "../queries";
import {
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
import { VisitStartCode } from "./visit-start-code";

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
    return <MockProfessionalCard serviceName={unit.lines[0]?.label} />;
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
}: {
  unit: FulfilmentUnit;
  isPaid: boolean;
}) {
  const services = serviceLinesOf(unit);

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-lg font-bold text-text">Your visit</h1>
        <UnitStatusBadge unit={unit} />
      </div>

      {unit.booking_status ? (
        <div className="mt-4">
          <VisitProgress status={unit.booking_status} />
        </div>
      ) : null}

      {unit.booking_id && unit.booking_status ? (
        <div className="mt-4">
          <VisitStartCode bookingId={unit.booking_id} status={unit.booking_status} />
        </div>
      ) : null}

      <section className="mt-5" aria-labelledby="visit-professional">
        <h3 id="visit-professional" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Professional
        </h3>
        <div className="mt-2">
          <ProfessionalBlock unit={unit} isPaid={isPaid} />
        </div>
      </section>

      <RecoveryNote unit={unit} />

      {services.length > 0 ? (
        <section className="mt-5" aria-labelledby="visit-service">
          <h3 id="visit-service" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Service
          </h3>
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

      <section className="mt-5 border-t border-line pt-5" aria-labelledby="visit-schedule">
        <h3 id="visit-schedule" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Schedule
        </h3>
        <div className="mt-3">
          <ScheduleBlock unit={unit} />
        </div>
      </section>

      {unit.booking_id ? <SingleVisitLiveActions bookingId={unit.booking_id} /> : null}
    </article>
  );
}

function SingleVisitLiveActions({ bookingId }: { bookingId: string }) {
  const visit = useVisit(bookingId);
  if (visit.data === undefined) return null;
  return <VisitActions visit={visit.data} />;
}

/** Compact card on a multi-visit paid overview. */
export function MultiVisitOverviewCard({
  unit,
  index,
  total,
  groupId,
  isPaid,
}: {
  unit: FulfilmentUnit;
  index: number;
  total: number;
  groupId: string;
  isPaid: boolean;
}) {
  const services = serviceLinesOf(unit);

  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </h3>
        <UnitStatusBadge unit={unit} />
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={unit.starts_at}>{formatBookingWhen(unit.starts_at)}</time>
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </p>

      {unit.booking_id && unit.booking_status ? (
        <div className="mt-3">
          <VisitStartCode bookingId={unit.booking_id} status={unit.booking_status} />
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Professional</p>
        <div className="mt-2">
          <ProfessionalBlock unit={unit} isPaid={isPaid} />
        </div>
      </div>

      <RecoveryNote unit={unit} />

      {services.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Service</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-text">
            {services.map((line) => (
              <li key={line.id}>
                {line.label}
                {line.quantity > 1 ? (
                  <span className="text-text-secondary"> × {line.quantity}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unit.booking_id ? (
        <Link
          href={bookingVisitHref(groupId, unit.booking_id)}
          prefetch={false}
          className={`${buttonStyles({ variant: "outline", className: "mt-4 w-full justify-center sm:w-auto" })}`}
        >
          View details
        </Link>
      ) : null}
    </li>
  );
}

const paymentCardClass =
  "rounded-card border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-24";

function PaymentLineRow({ line }: { line: FulfilmentUnit["lines"][number] }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-text-secondary">
        {linePresentationLabel(line)}
        {line.kind === "SERVICE" && line.quantity > 1 ? (
          <span> × {line.quantity}</span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums text-text">
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
      className={`${buttonStyles({ variant: "outline", className: "mt-5 w-full justify-center" })}`}
    >
      View your receipt
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
  return (
    <aside className={paymentCardClass}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Payment summary
      </h2>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {unit.lines.map((line) => (
          <PaymentLineRow key={line.id} line={line} />
        ))}
      </ul>
      <p className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold text-text">
        <span>Visit total</span>
        <Money value={unit.total} className="tabular-nums" />
      </p>
      <ReceiptLink groupId={groupId} orderId={orderId} />
    </aside>
  );
}

/** Right-column payment summary for a paid multi-visit booking. */
export function PaidGroupPaymentCard({ group }: { group: BookingGroup }) {
  const currency = group.units[0]?.total.currency ?? "INR";
  const totalPaise = group.units.reduce((sum, unit) => sum + unit.total.amount_paise, 0);

  return (
    <aside className={paymentCardClass}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Payment summary
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {group.units.map((unit, index) => (
          <div
            key={unit.id}
            className={index > 0 ? "border-t border-line pt-4" : undefined}
          >
            <p className="text-xs font-semibold text-text">Visit {index + 1}</p>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {unit.lines.map((line) => (
                <PaymentLineRow key={line.id} line={line} />
              ))}
            </ul>
            <p className="mt-2 flex justify-between text-sm text-text-secondary">
              <span>Visit total</span>
              <Money value={unit.total} className="tabular-nums" />
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold text-text">
        <span>Booking total</span>
        <Money
          value={{ amount_paise: totalPaise, currency }}
          className="tabular-nums"
        />
      </p>
      <ReceiptLink groupId={group.id} orderId={group.order_id} />
    </aside>
  );
}
