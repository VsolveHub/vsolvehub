"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, ErrorState } from "@vsolve/ui";
import Link from "next/link";

import type { Checkout, FulfilmentUnit } from "../queries";
import { Money } from "./money";

/**
 * The Booking Group Django created, and the honest edge of what this client can
 * still say about it.
 *
 * Contract 1.9.0 published `GET /booking-groups/`, `GET /booking-groups/{id}/`
 * and a versioned idempotent cancel, so the group *is* readable — this screen
 * must not claim otherwise. What it does not do is read them: bounded observation
 * of group and unit progress is FE-09's, and building half of it here would mean
 * a poller with no reconnect, backoff or freshness semantics.
 *
 * Payment now exists (BE-08, published 1.10.0 and reachable from a group since
 * 1.14.0), so this screen links to it rather than declaring it unavailable. It
 * still does not claim a charge: nothing is due until every visit has a
 * professional committed, and the link below is to the payment screen, which
 * reads the server's own `recovery_action` before offering anything.
 *
 * Nothing here polls, and nothing advances state. Confirmation starts a search
 * that Django's own workers run; a browser that observes it does not drive it,
 * and this screen does not yet observe.
 */

const UNIT_STATUS_LABELS: Record<Schemas["FulfilmentUnitStatusEnum"], string> = {
  PLANNED: "Planned",
  MATCHING: "Finding a professional",
  HELD: "Professional held",
  PAYMENT_PENDING: "Awaiting payment",
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  FAILED: "Could not be filled",
  COMPLETED: "Completed",
};

const GROUP_STATUS_LABELS: Record<Schemas["BookingGroupStatusEnum"], string> = {
  CONFIRMED: "Confirmed",
  MATCHING: "Finding professionals",
  PARTIALLY_HELD: "Some professionals held",
  ALL_UNITS_HELD: "All professionals held",
  PAYMENT_PENDING: "Awaiting payment",
  BOOKED: "Booked",
  REPLAN_REQUIRED: "Needs replanning",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Could not be completed",
};

function UnitCard({ unit }: { unit: FulfilmentUnit }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Visit {unit.position + 1}</h3>
        <Badge tone="neutral">{UNIT_STATUS_LABELS[unit.status]}</Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={unit.starts_at}>
          {new Date(unit.starts_at).toLocaleString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </p>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {unit.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span className="text-text">
              {line.label}
              {line.quantity > 1 ? (
                <span className="text-text-secondary"> × {line.quantity}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-text-secondary">
              <Money value={line.amount} />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex justify-between text-sm font-semibold text-text">
        <span>Visit total</span>
        <Money value={unit.total} className="tabular-nums" />
      </p>
    </li>
  );
}

export function GroupResult({ checkout }: { checkout: Checkout }) {
  const group = checkout.booking_group;

  if (group === null) {
    // The command succeeded but returned no group. Saying "booked" here would be
    // a success claim the response does not support.
    return (
      <ErrorState
        severity="warning"
        title="Your request went through, but we cannot show it yet"
        message="The server accepted it and did not return the booking details. Nothing has been charged. Please contact support with this page open rather than sending it again."
      />
    );
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-text">Your booking is confirmed</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {GROUP_STATUS_LABELS[group.status]} · {group.units.length}{" "}
        {group.units.length === 1 ? "visit" : "visits"}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {group.units.map((unit) => (
          <UnitCard key={unit.id} unit={unit} />
        ))}
      </ul>

      {/* The honest boundary. Django is tracking this group and will keep
          progressing it without the browser; what this release does not have is
          a screen that watches it. Saying "we cannot track it" would be false,
          and a live status here would be a poller built without the reconnect
          and freshness rules that make one safe. */}
      <div className="mt-6 rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="text-sm font-semibold text-text">What happens next</h3>
        <p className="mt-1 text-sm text-text-secondary">
          We are offering these visits to professionals now. You have not been charged,
          and payment is only enabled once every visit has someone committed to it.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          This carries on without this page open — closing the tab does not stop it.
          The statuses above are from the moment you confirmed and do not update here
          yet, so we will contact you as it progresses. Please do not confirm again:
          it would only produce this same booking.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          Reference <span className="font-mono tabular-nums">{group.id}</span>
        </p>

        {/* The route out of this screen. It is a link and not a payment control
            on purpose: whether anything is due is Django's answer, and the
            booking page reads it live rather than deciding here from a status
            captured at confirmation. */}
        <p className="mt-4">
          <Link
            href={`/bookings/${group.id}`}
            className="text-sm font-semibold text-text-link hover:underline"
          >
            Track this booking and pay when it is ready
          </Link>
        </p>
      </div>
    </div>
  );
}
