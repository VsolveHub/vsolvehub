"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  LoadMore,
  formatMoney,
} from "@vsolve/ui";
import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useListingCounts } from "@/features/money/money-tab";
import { filterChipStyles } from "@/features/money/service-tabs";
import { useDebounced } from "@/features/shared/use-debounced";
import { VISIT_STATUS_LABEL } from "@/features/visits/queries";

import {
  STATUS_GROUPS,
  fetchHomeBookingsPage,
  statusForGroup,
  type HomeBookingRow,
  type StatusGroupKey,
} from "../queries";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  CONFIRMED: "info",
  EN_ROUTE: "info",
  ARRIVED: "warning",
  IN_PROGRESS: "warning",
  COMPLETION_SUBMITTED: "warning",
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "success",
  DISPUTED: "danger",
  RECOVERY_REQUIRED: "danger",
  ABORTED: "neutral",
  CANCELLED: "neutral",
};

function Contact({ label, name, phone }: { label: string; name: string; phone: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-text-muted">{label}</dt>
      <dd className="truncate text-navy-900">{name || "—"}</dd>
      {phone ? (
        <dd>
          <a className="inline-flex items-center gap-1 text-sm text-text-link" href={`tel:${phone}`}>
            <Phone aria-hidden className="size-3" /> {phone}
          </a>
        </dd>
      ) : null}
    </div>
  );
}

function BookingCard({ row }: { row: HomeBookingRow }) {
  return (
    <Card className={row.is_late ? "border-danger-line" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">{row.services.join(", ") || "Home service visit"}</p>
          <p className="text-sm text-text-secondary">
            {WHEN.format(new Date(row.scheduled_start))}
            {row.area ? ` · ${row.area}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.is_late ? <Badge tone="danger">Running late</Badge> : null}
          {row.payout_hold ? <Badge tone="warning">Payout on hold</Badge> : null}
          {row.needs_redispatch ? <Badge tone="warning">Needs a partner</Badge> : null}
          <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
            {VISIT_STATUS_LABEL[row.status] ?? row.status}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <Contact label="Customer" name={row.customer_name} phone={row.customer_phone} />
        <Contact label="Partner" name={row.partner_display_name} phone={row.partner_phone} />
        <div>
          <dt className="text-xs font-semibold uppercase text-text-muted">Visit price</dt>
          <dd className="text-navy-900" data-numeric>
            {formatMoney(row.total_paise)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="truncate text-xs text-text-muted">Booking {row.id}</p>
        <Link
          href={`/operations/visits?id=${row.id}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-text-link hover:underline"
        >
          Open visit <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

/**
 * Every home-service visit, newest first, searchable and filtered on the server. Opening one goes
 * to the visit page, where the partner can be swapped or the visit started.
 */
export function HomeBookings() {
  const [group, setGroup] = useState<StatusGroupKey>("");
  const [late, setLate] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const q = useDebounced(search.trim());
  const counts = useListingCounts("home-services");

  const filters = { status: statusForGroup(group), q, late, dateFrom, dateTo };
  const bookings = usePagedList(["ops-home-bookings", filters], (cursor) =>
    fetchHomeBookingsPage(cursor, {
      status: filters.status || undefined,
      q: q || undefined,
      late,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  );
  const rows = bookings.items;

  return (
    <section className="flex flex-col gap-4">
      <div role="group" aria-label="Visits by stage" className="flex flex-wrap gap-2">
        {STATUS_GROUPS.map((entry) => {
          const count = counts?.[entry.key === "" ? "total" : entry.key];
          return (
            <button
              key={entry.key || "all"}
              type="button"
              aria-pressed={group === entry.key && !late}
              className={filterChipStyles(group === entry.key && !late)}
              onClick={() => {
                setLate(false);
                setGroup(entry.key);
              }}
            >
              {entry.label}
              {typeof count === "number" ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={late}
          className={filterChipStyles(late)}
          onClick={() => {
            setGroup("");
            setLate((value) => !value);
          }}
        >
          Running late
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
        <Field label="Search">
          <Input
            value={search}
            placeholder="Customer or partner name, phone, or booking id"
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field label="Visit from">
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </Field>
        <Field label="Visit to">
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </Field>
      </div>

      {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading visits…</p> : null}
      {bookings.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(bookings.error)}
        </p>
      ) : null}
      {!bookings.isLoading && !bookings.error && rows.length === 0 ? (
        <EmptyState title="No visits" description="Visits matching these filters appear here." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <BookingCard row={row} />
          </li>
        ))}
      </ul>
      <LoadMore hasMore={bookings.hasMore} loading={bookings.loadingMore} onLoadMore={bookings.loadMore} />
    </section>
  );
}
