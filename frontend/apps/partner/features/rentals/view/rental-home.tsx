"use client";

import { fetchAllPages } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Card, Spinner, buttonStyles } from "@vsolve/ui";
import { ArrowRight, Clock, PackageCheck, PackageOpen, Phone, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { dateLabel, isSameLocalDay } from "@/features/rentals/pickup-time";
import {
  fetchPartnerPickupHours,
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookingsPage,
  type PartnerRentalBooking,
} from "@/features/rentals/queries";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function time(value: string | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

/**
 * Home for a partner who only rents items out.
 *
 * There is no "go online" here: a rental partner never receives live job
 * offers, so availability is the item list and the pickup hours, not a switch.
 * The home answers "who is coming today, and what do I have free".
 */
export function RentalHome() {
  const [now] = useState(() => new Date());
  // Only live bookings matter here, and there are few of them, so all of their pages are read.
  const bookings = useQuery({
    queryKey: ["partner-rentals", "bookings", "home"],
    queryFn: () =>
      fetchAllPages((cursor) =>
        fetchPartnerRentalBookingsPage("AWAITING_TRANSPORT_QUOTE,CONFIRMED,HANDOVER", cursor),
      ),
  });
  const assets = useQuery({ queryKey: ["partner-rentals", "assets"], queryFn: fetchPartnerRentalAssets });
  const hours = useQuery({ queryKey: ["partner-rentals", "pickup-hours"], queryFn: fetchPartnerPickupHours });

  const rows = (bookings.data ?? []) as PartnerRentalBooking[];
  const deliveryRequests = rows.filter(
    (b) => b.status === "AWAITING_TRANSPORT_QUOTE" && b.transport?.status === "REQUESTED",
  );
  const pickups = rows
    .filter((b) => b.status === "CONFIRMED" && isSameLocalDay(b.start_date, now))
    .sort((a, b) => time(a.start_date) - time(b.start_date));
  const returns = rows
    .filter(
      (b) =>
        b.status === "HANDOVER" &&
        (isSameLocalDay(b.end_date, now) || time(b.end_date) < now.getTime()),
    )
    .sort((a, b) => time(a.end_date) - time(b.end_date));
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const upcoming = rows
    .filter(
      (b) =>
        b.status === "CONFIRMED" &&
        time(b.start_date) >= endOfToday &&
        time(b.start_date) < now.getTime() + WEEK_MS,
    )
    .sort((a, b) => time(a.start_date) - time(b.start_date));

  const live = (assets.data ?? []).filter((a) => a.public_state === "PUBLISHED");
  const pieces = live.reduce((n, a) => n + a.quantity_available, 0);
  const activeBookings = rows.filter((b) => b.status === "CONFIRMED" || b.status === "HANDOVER");
  const booked = activeBookings.reduce((n, b) => n + (b.quantity ?? 1), 0);
  const free = Math.max(0, pieces - booked);

  if (bookings.isPending || assets.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your rentals…
      </p>
    );
  }

  const failure = bookings.error ?? assets.error;
  if (failure) {
    return <p className="py-8 text-center text-sm text-danger-text">{friendlyErrorMessage(failure)}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {hours.data && !hours.data.is_set ? (
        <Link
          href="/rentals#pickup-hours"
          className="flex items-center gap-3 rounded-card border border-warning-text/30 bg-warning-surface px-4 py-3 text-sm"
        >
          <Clock className="size-5 shrink-0 text-warning-text" aria-hidden />
          <span className="flex-1">
            <span className="block font-semibold text-navy-900">Set your pickup hours</span>
            <span className="block text-text-secondary">
              Customers see when they can collect, and new items go live only once these are set.
            </span>
          </span>
          <ArrowRight className="size-4 text-text-muted" aria-hidden />
        </Link>
      ) : null}

      {deliveryRequests.length > 0 ? (
        <Group
          title="Delivery requests — send your price"
          icon={<Truck className="size-4" />}
          empty=""
          rows={deliveryRequests}
          when={(b) => `Needed ${dateLabel(b.start_date)} · open it in Bookings to quote`}
        />
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Tally label="Live pieces" value={pieces} />
        <Tally label="Booked now" value={booked} tone="text-warning-text" />
        <Tally label="Available" value={free} tone="text-success-text" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Group
          title="Pickups today"
          icon={<PackageOpen className="size-4" />}
          empty="No one is collecting an item today."
          rows={pickups}
          when={(b) => (b.pickup_or_delivery_mode === "DELIVERY" ? `Deliver · ${dateLabel(b.start_date)}` : dateLabel(b.start_date))}
        />
        <Group
          title="Returns today"
          icon={<PackageCheck className="size-4" />}
          empty="No items are due back today."
          rows={returns}
          when={(b) => (time(b.end_date) < now.getTime() ? `Overdue · ${dateLabel(b.end_date)}` : dateLabel(b.end_date))}
          late={(b) => time(b.end_date) < now.getTime()}
        />
      </div>

      <Group
        title="Next 7 days"
        empty="No pickups booked for the coming week."
        rows={upcoming}
        when={(b) => dateLabel(b.start_date)}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/rentals?add=1" className={buttonStyles({})}>
          <Plus className="size-4" />
          Add an item
        </Link>
        <Link href="/rentals/bookings" className={buttonStyles({ variant: "outline" })}>
          See all bookings
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card padding="none" className="px-3 py-3">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone ?? "text-navy-900"}`}>{value}</p>
    </Card>
  );
}

function Group({
  title,
  icon,
  empty,
  rows,
  when,
  late,
}: {
  title: string;
  icon?: ReactNode;
  empty: string;
  rows: PartnerRentalBooking[];
  when: (b: PartnerRentalBooking) => string;
  late?: (b: PartnerRentalBooking) => boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        {icon ? <span className="text-text-muted">{icon}</span> : null}
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{title}</h2>
        {rows.length > 0 ? (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-text-muted">
            {rows.length}
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-4 text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Card padding="none" className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy-900">{b.asset?.title ?? "Rental item"}</p>
                  <p className="truncate text-sm text-text-secondary">
                    {b.customer_name || "Customer"}
                    {b.quantity > 1 ? ` · ${b.quantity} pieces` : ""}
                  </p>
                  {late?.(b) ? (
                    <Badge tone="danger" dot>
                      {when(b)}
                    </Badge>
                  ) : (
                    <p className="text-sm font-semibold text-navy-900">{when(b)}</p>
                  )}
                </div>
                {b.customer_phone ? (
                  <a
                    href={`tel:${b.customer_phone}`}
                    aria-label={`Call ${b.customer_name || "customer"}`}
                    className={buttonStyles({ size: "sm", variant: "outline" })}
                  >
                    <Phone className="size-4" />
                    Call
                  </a>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
