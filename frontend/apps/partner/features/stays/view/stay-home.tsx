"use client";

import { useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Card, Spinner, buttonStyles } from "@vsolve/ui";
import { ArrowRight, BedDouble, CalendarClock, LogIn, LogOut, MessageSquare, Phone, Star } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  clockWindow,
  dayLabel,
  fetchPartnerStayEnquiries,
  fetchPartnerStayReservations,
  fetchPartnerStaySummary,
  fetchPartnerStayVisits,
} from "@/features/stays/queries";

type Row = {
  key: string;
  title: string;
  who: string;
  when: string;
  phone?: string;
  href: string;
};

function isoToday(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** "2026-10-12" or "2026-10-12T…" → the calendar day only. */
function dayOf(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

/**
 * Home for a partner who only lists stays (PG, hostel, homestay, hotel).
 *
 * No "go online": stay owners never get live job offers. The home answers what
 * the owner acts on: who is waiting for a call back, which visits need a yes or
 * no, who arrives or leaves today, and how many rooms are free.
 */
export function StayHome() {
  const [now] = useState(() => new Date());
  const today = isoToday(now);

  const summary = useQuery({ queryKey: ["partner-stays", "summary"], queryFn: fetchPartnerStaySummary });
  const enquiries = useQuery({ queryKey: ["partner-stays", "enquiries"], queryFn: fetchPartnerStayEnquiries });
  const visits = useQuery({ queryKey: ["partner-stays", "visits"], queryFn: fetchPartnerStayVisits });
  const reservations = useQuery({
    queryKey: ["partner-stays", "reservations"],
    queryFn: fetchPartnerStayReservations,
  });

  if (summary.isPending || enquiries.isPending || visits.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your stays…
      </p>
    );
  }
  const failure = summary.error ?? enquiries.error ?? visits.error;
  if (failure) {
    return <p className="py-8 text-center text-sm text-danger-text">{friendlyErrorMessage(failure)}</p>;
  }

  const enquiryRows = enquiries.data ?? [];
  const visitRows = visits.data ?? [];
  const reservationRows = reservations.data ?? [];

  const toCall: Row[] = enquiryRows
    .filter((e) => e.status === "SUBMITTED")
    .map((e) => ({
      key: `enq-${e.id}`,
      title: e.property_title + (e.unit_name ? ` · ${e.unit_name}` : ""),
      who: e.customer_name || "Guest",
      when: `Wants ${dayLabel(dayOf(e.check_in))}${e.guest_count ? ` · ${e.guest_count} guest${e.guest_count === 1 ? "" : "s"}` : ""}`,
      phone: e.customer_phone,
      href: "/stays/enquiries",
    }));

  const visitRequests: Row[] = visitRows
    .filter((v) => v.status === "REQUESTED")
    .sort((a, b) => (a.visit_date + a.start_time).localeCompare(b.visit_date + b.start_time))
    .map((v) => ({
      key: `vreq-${v.id}`,
      title: v.property_title,
      who: v.customer_name || "Visitor",
      when: `${dayLabel(v.visit_date)}, ${clockWindow(v.start_time, v.end_time)}`,
      phone: v.customer_phone,
      href: "/stays/visits",
    }));

  const visitsToday: Row[] = visitRows
    .filter((v) => v.status === "ACCEPTED" && v.visit_date === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((v) => ({
      key: `vtoday-${v.id}`,
      title: v.property_title,
      who: v.customer_name || "Visitor",
      when: clockWindow(v.start_time, v.end_time),
      phone: v.customer_phone,
      href: "/stays/visits",
    }));

  const arriving: Row[] = [
    ...enquiryRows
      .filter((e) => e.status === "CONFIRMED" && dayOf(e.check_in) === today)
      .map((e) => ({
        key: `arr-e-${e.id}`,
        title: e.property_title + (e.unit_name ? ` · ${e.unit_name}` : ""),
        who: e.customer_name || "Guest",
        when: "Moving in today",
        phone: e.customer_phone,
        href: "/stays/enquiries",
      })),
    ...reservationRows
      .filter((r) => r.status === "CONFIRMED" && dayOf(r.check_in) === today)
      .map((r) => ({
        key: `arr-r-${r.id}`,
        title: (r.property_title ?? "Stay") + (r.unit_name ? ` · ${r.unit_name}` : ""),
        who: r.customer_name || "Guest",
        when: "Checking in today",
        phone: r.customer_phone,
        href: "/stays/bookings",
      })),
  ];

  const leaving: Row[] = [
    ...enquiryRows
      .filter((e) => e.status === "CONFIRMED" && dayOf(e.check_out) === today)
      .map((e) => ({
        key: `dep-e-${e.id}`,
        title: e.property_title + (e.unit_name ? ` · ${e.unit_name}` : ""),
        who: e.customer_name || "Guest",
        when: "Leaving today",
        phone: e.customer_phone,
        href: "/stays/enquiries",
      })),
    ...reservationRows
      .filter((r) => r.status === "CHECKED_IN" && dayOf(r.check_out) <= today)
      .map((r) => ({
        key: `dep-r-${r.id}`,
        title: (r.property_title ?? "Stay") + (r.unit_name ? ` · ${r.unit_name}` : ""),
        who: r.customer_name || "Guest",
        when: dayOf(r.check_out) < today ? "Check-out overdue" : "Checking out today",
        phone: r.customer_phone,
        href: "/stays/bookings",
      })),
  ];

  const s = summary.data;

  return (
    <div className="flex flex-col gap-5">
      {s ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tally label="Rooms free" value={s.available_rooms} tone="text-success-text" />
          <Tally label="Rooms booked" value={s.booked_rooms} tone="text-warning-text" />
          <Tally label="Total rooms" value={s.total_rooms} hint={`${s.live_properties} of ${s.total_properties} properties live`} />
          <Tally
            label="Reviews"
            value={s.review_count}
            hint={s.average_rating != null ? `★ ${s.average_rating} average` : "No ratings yet"}
            icon={<Star className="size-3.5" />}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Group
          title="Call back"
          icon={<MessageSquare className="size-4" />}
          empty="No new enquiries waiting for a call."
          rows={toCall}
          more={{ href: "/stays/enquiries", label: "All enquiries" }}
        />
        <Group
          title="Visit requests to answer"
          icon={<CalendarClock className="size-4" />}
          empty="No visit requests waiting."
          rows={visitRequests}
          more={{ href: "/stays/visits", label: "All visits" }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Group title="Visits today" icon={<CalendarClock className="size-4" />} empty="No visits today." rows={visitsToday} />
        <Group title="Arriving today" icon={<LogIn className="size-4" />} empty="No one moves in today." rows={arriving} />
        <Group title="Leaving today" icon={<LogOut className="size-4" />} empty="No one leaves today." rows={leaving} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/stays" className={buttonStyles({})}>
          <BedDouble className="size-4" />
          Manage rooms
        </Link>
        <Link href="/stays/enquiries" className={buttonStyles({ variant: "outline" })}>
          Enquiries
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/stays/visits" className={buttonStyles({ variant: "outline" })}>
          Visits
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card padding="none" className="px-3 py-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-text-muted">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone ?? "text-navy-900"}`}>{value}</p>
      {hint ? <p className="text-[11px] text-text-secondary">{hint}</p> : null}
    </Card>
  );
}

function Group({
  title,
  icon,
  empty,
  rows,
  more,
}: {
  title: string;
  icon?: ReactNode;
  empty: string;
  rows: Row[];
  more?: { href: string; label: string };
}) {
  const shown = rows.slice(0, 5);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        {icon ? <span className="text-text-muted">{icon}</span> : null}
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{title}</h2>
        {rows.length > 0 ? (
          <span className="rounded-full bg-action px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-action-text">
            {rows.length}
          </span>
        ) : null}
        {more && rows.length > shown.length ? (
          <Link href={more.href} className="ml-auto text-xs font-semibold text-text-link hover:underline">
            {more.label} →
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-4 text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.key}>
              <Card padding="none" className="flex items-center gap-3 px-4 py-3">
                <Link href={row.href} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy-900">{row.who}</p>
                  <p className="truncate text-sm text-text-secondary">{row.title}</p>
                  <p className="text-sm font-semibold text-navy-900">{row.when}</p>
                </Link>
                {row.phone ? (
                  <a
                    href={`tel:${row.phone}`}
                    aria-label={`Call ${row.who}`}
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
