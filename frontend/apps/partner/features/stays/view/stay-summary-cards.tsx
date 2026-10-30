"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { StatCard, useT } from "@vsolve/ui";
import { BedDouble, Building2, CalendarClock, CheckCircle2, Lock, Star } from "lucide-react";

import { fetchPartnerStaySummary } from "@/features/stays/queries";

/** The owner's overview: properties, rooms, what's available and booked, reviews, and what
 * needs an answer. */
export function StaySummaryCards() {
  const t = useT();
  const summary = useQuery({
    queryKey: ["partner-stays", "summary"],
    queryFn: fetchPartnerStaySummary,
  });
  const data = summary.data;
  if (!data) return null;

  const rating = data.average_rating != null ? ` · ★ ${data.average_rating}` : "";
  return (
    <section aria-label={t("stays.summary.ariaLabel")} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t("stays.summary.properties")} value={data.total_properties} icon={<Building2 className="size-4" />} />
        <StatCard label={t("stays.summary.totalRooms")} value={data.total_rooms} icon={<BedDouble className="size-4" />} />
        <StatCard
          label={t("stays.summary.available")}
          value={data.available_rooms}
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard label={t("stays.summary.booked")} value={data.booked_rooms} icon={<Lock className="size-4" />} />
        <StatCard
          label={t("stays.summary.reviews")}
          value={`${data.review_count}${rating}`}
          icon={<Star className="size-4" />}
        />
      </div>
      {data.new_enquiries > 0 || data.pending_visits > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.new_enquiries > 0 ? (
            <Link
              href="/stays/enquiries"
              className="inline-flex items-center gap-2 rounded-full bg-action px-4 py-2 text-sm font-bold text-action-text shadow-sm hover:bg-action-hover"
            >
              {t("stays.summary.newEnquiries", { count: data.new_enquiries })}
            </Link>
          ) : null}
          {data.pending_visits > 0 ? (
            <Link
              href="/stays/visits"
              className="inline-flex items-center gap-2 rounded-full border border-action bg-surface px-4 py-2 text-sm font-bold text-action hover:bg-action-surface"
            >
              <CalendarClock className="size-4" aria-hidden />
              {t("stays.summary.pendingVisits", { count: data.pending_visits })}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
