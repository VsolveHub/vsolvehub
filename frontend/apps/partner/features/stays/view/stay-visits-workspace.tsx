"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, Button, Card, Dialog, EmptyState, Field, LoadMore, Textarea, useT } from "@vsolve/ui";
import { CalendarClock, Phone } from "lucide-react";
import { useMemo, useState } from "react";

import {
  VISIT_DECLINE_REASONS,
  clockWindow,
  dayLabel,
  fetchPartnerStayVisitsPage,
  partnerStayRoomAction,
  partnerStayVisitAction,
  type PartnerStayVisit,
  type VisitDeclineReason,
} from "@/features/stays/queries";
import { RoomChoice, useBookableRooms } from "@/features/stays/view/stay-record-sheets";
import { useStaySections } from "@/features/stays/view/stay-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

/** Second element is a catalogue key, resolved with `t` at render time. */
const FILTERS = [
  ["REQUESTED", "stays.visits.filter.requested"],
  ["ACCEPTED", "stays.visits.filter.accepted"],
  ["CLOSED", "stays.enquiries.filter.closed"],
] as const;
type Filter = (typeof FILTERS)[number][0];

/** `label` is a catalogue key, resolved with `t` at render time. */
const STATUS: Record<string, { label: string; tone: "info" | "success" | "danger" | "neutral" }> = {
  REQUESTED: { label: "stays.visits.status.requested", tone: "info" },
  ACCEPTED: { label: "stays.visits.status.accepted", tone: "success" },
  DECLINED: { label: "stays.visits.status.declined", tone: "danger" },
  CANCELLED: { label: "stays.visits.status.cancelled", tone: "neutral" },
  EXPIRED: { label: "stays.enquiryStatus.expired", tone: "neutral" },
};

/** Each tab as the visit states the server filters on. Exported for tests. */
export const VISIT_FILTER_STATUSES: Record<Filter, string> = {
  REQUESTED: "REQUESTED",
  ACCEPTED: "ACCEPTED",
  CLOSED: "DECLINED,CANCELLED,EXPIRED",
};

/**
 * Visit requests, grouped by day and slot ("Sat 12 Oct · 5 PM – 6 PM · 3 visitors"). The owner
 * accepts or declines each guest; a reason for declining is optional. After a visit the owner
 * can mark a room booked for that guest.
 */
export function PartnerStayVisitsWorkspace() {
  const t = useT();
  const sections = useStaySections();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("REQUESTED");
  const [declining, setDeclining] = useState<PartnerStayVisit | null>(null);
  const [reason, setReason] = useState<VisitDeclineReason | "">("");
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState<PartnerStayVisit | null>(null);
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visits = usePagedList(["partner-stays", "visits", filter], (cursor) =>
    fetchPartnerStayVisitsPage(cursor, VISIT_FILTER_STATUSES[filter]),
  );
  // Tab badges count their own first page, so they stay right whichever tab is open.
  const [requestedPage, acceptedPage] = useQueries({
    queries: (["REQUESTED", "ACCEPTED"] as const).map((name) => ({
      queryKey: ["partner-stays", "visits", "count", name],
      queryFn: () => fetchPartnerStayVisitsPage(undefined, name),
    })),
  }).map((query) => query.data);
  const rooms = useBookableRooms(booking?.property, booking?.unit);

  const act = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onSuccess: () => {
      setError(null);
      setDeclining(null);
      setBooking(null);
      void qc.invalidateQueries({ queryKey: ["partner-stays"] });
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  const all = visits.items;
  const countOf = (page: typeof requestedPage) =>
    page ? `${page.results.length}${page.next ? "+" : ""}` : "0";
  const counts: Record<Filter, string> = {
    REQUESTED: countOf(requestedPage),
    ACCEPTED: countOf(acceptedPage),
    CLOSED: "0",
  };
  const groups = useMemo(() => {
    const map = new Map<string, PartnerStayVisit[]>();
    for (const visit of all) {
      const key = `${visit.visit_date}|${visit.start_time}|${visit.end_time}|${visit.property}`;
      map.set(key, [...(map.get(key) ?? []), visit]);
    }
    const list = [...map.values()];
    return filter === "CLOSED" ? list.reverse() : list;
  }, [all, filter]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">{t("stays.bookings.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t("stays.visits.heading")}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("stays.visits.intro")}
        </p>
      </div>

      <SectionNav label={t("stays.sections.ariaLabel")} items={sections} />

      <Card>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === value
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {t(label)}
              {value !== "CLOSED" && counts[value] !== "0" ? ` (${counts[value]})` : ""}
            </button>
          ))}
        </div>

        {visits.isLoading ? <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p> : null}
        {visits.error ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(visits.error)}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger-text">{error}</p> : null}
        {!visits.isLoading && !visits.error && groups.length === 0 ? (
          <EmptyState
            compact
            className="mt-3"
            title={
              filter === "REQUESTED" ? t("stays.visits.emptyRequested") : t("stays.enquiries.emptyOther")
            }
            description={t("stays.visits.emptyDescription")}
          />
        ) : null}

        <ul className="mt-3 flex flex-col gap-4">
          {groups.map((group) => {
            const first = group[0]!;
            return (
              <li key={`${first.visit_date}-${first.start_time}-${first.property}`}>
                <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-navy-900">
                  <CalendarClock className="size-4 text-action" aria-hidden />
                  {dayLabel(first.visit_date)} · {clockWindow(first.start_time, first.end_time)}
                  <span className="font-normal text-text-secondary">
                    · {first.property_title} · {t("stays.visits.visitors", { count: group.length })}
                  </span>
                </p>
                <ul className="flex flex-col gap-2">
                  {group.map((visit) => {
                    const look = STATUS[visit.status ?? ""] ?? STATUS.EXPIRED!;
                    return (
                      <li
                        key={visit.id}
                        className="flex flex-col gap-3 rounded-card border border-line p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-navy-900">
                              {visit.customer_name || t("stays.sheet.guest")}
                            </span>
                            <Badge tone={look.tone}>{t(look.label)}</Badge>
                          </p>
                          <p className="text-sm text-text-secondary">
                            {visit.customer_phone}
                            {visit.unit_name
                              ? ` · ${t("stays.visits.interestedIn", { name: visit.unit_name })}`
                              : ""}
                          </p>
                          {visit.message ? (
                            <p className="mt-1 text-sm text-text">&ldquo;{visit.message}&rdquo;</p>
                          ) : null}
                          {visit.status === "DECLINED" && visit.reason_text ? (
                            <p className="mt-1 text-xs text-text-secondary">
                              {t("stays.visits.reasonGiven", { reason: visit.reason_text })}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visit.customer_phone &&
                          (visit.status === "REQUESTED" || visit.status === "ACCEPTED") ? (
                            <a
                              href={`tel:${visit.customer_phone}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-xs font-bold text-text hover:border-line-strong"
                            >
                              <Phone className="size-4" aria-hidden />
                              {t("stays.enquiries.call")}
                            </a>
                          ) : null}
                          {visit.status === "REQUESTED" ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={act.isPending}
                                onClick={() => {
                                  setReason("");
                                  setNote("");
                                  setDeclining(visit);
                                }}
                              >
                                {t("stays.visits.decline")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={act.isPending}
                                onClick={() =>
                                  act.mutate(() => partnerStayVisitAction(visit.id, "accept"))
                                }
                              >
                                {t("stays.visits.accept")}
                              </Button>
                            </>
                          ) : null}
                          {visit.status === "ACCEPTED" ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={act.isPending}
                                onClick={() => {
                                  setReason("");
                                  setNote("");
                                  setDeclining(visit);
                                }}
                              >
                                {t("stays.visits.cancelVisit")}
                              </Button>
                              <Button size="sm" onClick={() => setBooking(visit)}>
                                {t("stays.enquiry.markBooked")}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <LoadMore hasMore={visits.hasMore} loading={visits.loadingMore} onLoadMore={visits.loadMore} />
      </Card>

      <Dialog
        open={declining !== null}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={t("stays.visits.declineTitle")}
        description={t("stays.visits.declineBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              {t("common.back")}
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              onClick={() =>
                declining &&
                act.mutate(() =>
                  partnerStayVisitAction(declining.id, "decline", { reason, note: note.trim() }),
                )
              }
            >
              {t("stays.visits.declineVisit")}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-navy-900">{t("stays.visits.reasonLegend")}</legend>
          {[{ value: "" as const, labelKey: "stays.visits.noReason" }, ...VISIT_DECLINE_REASONS].map(
            (option) => (
              <label key={option.value || "none"} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="decline-reason"
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                />
                {t(option.labelKey)}
              </label>
            ),
          )}
          {reason === "OTHER" ? (
            <Field label={t("stays.enquiry.noteLabel")} showOptional>
              <Textarea
                rows={2}
                maxLength={240}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          ) : null}
        </fieldset>
      </Dialog>

      <Dialog
        open={booking !== null}
        onOpenChange={(open) => !open && setBooking(null)}
        title={t("stays.enquiry.bookingConfirmed")}
        description={
          booking
            ? t("stays.visits.bookDialogBody", {
                name: booking.customer_name || t("stays.enquiries.theGuest"),
              })
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setBooking(null)}>
              {t("stays.enquiry.notYet")}
            </Button>
            <Button
              loading={act.isPending}
              disabled={rooms.length === 0}
              onClick={() =>
                booking &&
                act.mutate(() =>
                  partnerStayRoomAction(roomId || rooms[0]?.id || "", "book", { visit_id: booking.id }),
                )
              }
            >
              {t("stays.enquiry.confirmBooked")}
            </Button>
          </>
        }
      >
        <RoomChoice rooms={rooms} value={roomId || rooms[0]?.id || ""} onChange={setRoomId} />
      </Dialog>
    </div>
  );
}
