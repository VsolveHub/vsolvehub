"use client";

import { fetchAllPages } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Card, Spinner, buttonStyles, useT } from "@vsolve/ui";
import { ArrowRight, BedDouble, CalendarClock, LogIn, LogOut, MessageSquare, Phone, Star } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  clockWindow,
  dayLabel,
  fetchPartnerStayEnquiriesPage,
  fetchPartnerStayReservationsPage,
  fetchPartnerStaySummary,
  fetchPartnerStayVisitsPage,
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
  const t = useT();
  const [now] = useState(() => new Date());
  const today = isoToday(now);

  const summary = useQuery({ queryKey: ["partner-stays", "summary"], queryFn: fetchPartnerStaySummary });
  // The home only reads what still needs the owner, so it asks for those states and reads all
  // of their pages; closed history stays on the section screens, which page.
  const enquiries = useQuery({
    queryKey: ["partner-stays", "enquiries", "home"],
    queryFn: () =>
      fetchAllPages((cursor) => fetchPartnerStayEnquiriesPage(cursor, "SUBMITTED,CONFIRMED")),
  });
  const visits = useQuery({
    queryKey: ["partner-stays", "visits", "home"],
    queryFn: () =>
      fetchAllPages((cursor) => fetchPartnerStayVisitsPage(cursor, "REQUESTED,ACCEPTED")),
  });
  const reservations = useQuery({
    queryKey: ["partner-stays", "reservations", "home"],
    queryFn: () =>
      fetchAllPages((cursor) => fetchPartnerStayReservationsPage(cursor, "CONFIRMED,CHECKED_IN")),
  });

  if (summary.isPending || enquiries.isPending || visits.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        {t("stays.home.loading")}
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
      who: e.customer_name || t("stays.sheet.guest"),
      when: `${t("stays.home.wants", { day: dayLabel(dayOf(e.check_in)) })}${
        e.guest_count ? ` · ${t("stays.guests.count", { count: e.guest_count })}` : ""
      }`,
      phone: e.customer_phone,
      href: "/stays/enquiries",
    }));

  const visitRequests: Row[] = visitRows
    .filter((v) => v.status === "REQUESTED")
    .sort((a, b) => (a.visit_date + a.start_time).localeCompare(b.visit_date + b.start_time))
    .map((v) => ({
      key: `vreq-${v.id}`,
      title: v.property_title,
      who: v.customer_name || t("stays.home.visitor"),
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
      who: v.customer_name || t("stays.home.visitor"),
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
        who: e.customer_name || t("stays.sheet.guest"),
        when: t("stays.home.movingIn"),
        phone: e.customer_phone,
        href: "/stays/enquiries",
      })),
    ...reservationRows
      .filter((r) => r.status === "CONFIRMED" && dayOf(r.check_in) === today)
      .map((r) => ({
        key: `arr-r-${r.id}`,
        title: (r.property_title ?? t("stays.bookings.fallbackStay")) + (r.unit_name ? ` · ${r.unit_name}` : ""),
        who: r.customer_name || t("stays.sheet.guest"),
        when: t("stays.home.checkingIn"),
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
        who: e.customer_name || t("stays.sheet.guest"),
        when: t("stays.home.leaving"),
        phone: e.customer_phone,
        href: "/stays/enquiries",
      })),
    ...reservationRows
      .filter((r) => r.status === "CHECKED_IN" && dayOf(r.check_out) <= today)
      .map((r) => ({
        key: `dep-r-${r.id}`,
        title: (r.property_title ?? t("stays.bookings.fallbackStay")) + (r.unit_name ? ` · ${r.unit_name}` : ""),
        who: r.customer_name || t("stays.sheet.guest"),
        when:
          dayOf(r.check_out) < today ? t("stays.home.checkOutOverdue") : t("stays.home.checkingOut"),
        phone: r.customer_phone,
        href: "/stays/bookings",
      })),
  ];

  const s = summary.data;

  return (
    <div className="flex flex-col gap-5">
      {s ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tally label={t("stays.home.roomsFree")} value={s.available_rooms} tone="text-success-text" />
          <Tally label={t("stays.home.roomsBooked")} value={s.booked_rooms} tone="text-warning-text" />
          <Tally
            label={t("stays.summary.totalRooms")}
            value={s.total_rooms}
            hint={t("stays.home.propertiesLive", { live: s.live_properties, total: s.total_properties })}
          />
          <Tally
            label={t("stays.summary.reviews")}
            value={s.review_count}
            hint={
              s.average_rating != null
                ? t("stays.home.averageRating", { rating: s.average_rating })
                : t("stays.home.noRatings")
            }
            icon={<Star className="size-3.5" />}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Group
          title={t("stays.home.callBack")}
          icon={<MessageSquare className="size-4" />}
          empty={t("stays.home.callBackEmpty")}
          rows={toCall}
          more={{ href: "/stays/enquiries", label: t("stays.home.allEnquiries") }}
        />
        <Group
          title={t("stays.home.visitRequests")}
          icon={<CalendarClock className="size-4" />}
          empty={t("stays.home.visitRequestsEmpty")}
          rows={visitRequests}
          more={{ href: "/stays/visits", label: t("stays.home.allVisits") }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Group
          title={t("stays.home.visitsToday")}
          icon={<CalendarClock className="size-4" />}
          empty={t("stays.home.visitsTodayEmpty")}
          rows={visitsToday}
        />
        <Group
          title={t("stays.home.arrivingToday")}
          icon={<LogIn className="size-4" />}
          empty={t("stays.home.arrivingTodayEmpty")}
          rows={arriving}
        />
        <Group
          title={t("stays.home.leavingToday")}
          icon={<LogOut className="size-4" />}
          empty={t("stays.home.leavingTodayEmpty")}
          rows={leaving}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/stays" className={buttonStyles({})}>
          <BedDouble className="size-4" />
          {t("stays.home.manageRooms")}
        </Link>
        <Link href="/stays/enquiries" className={buttonStyles({ variant: "outline" })}>
          {t("stays.sections.enquiries")}
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/stays/visits" className={buttonStyles({ variant: "outline" })}>
          {t("stays.sections.visits")}
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
  const t = useT();
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
                    aria-label={t("stays.enquiry.call", { name: row.who })}
                    className={buttonStyles({ size: "sm", variant: "outline" })}
                  >
                    <Phone className="size-4" />
                    {t("stays.enquiries.call")}
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
