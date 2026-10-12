"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, Button, Card, Dialog, EmptyState, Field, LoadMore, Textarea, formatDate } from "@vsolve/ui";
import { Check, ChevronRight, Phone, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  cancelPartnerStayEnquiry,
  confirmPartnerStayEnquiry,
  fetchPartnerStayEnquiriesPage,
  respondPartnerStayEnquiry,
  type StayEnquiry,
  stayLengthLabel,
} from "@/features/stays/queries";
import { STAY_SECTIONS } from "@/features/stays/view/stay-sections";
import {
  StayEnquiryDetailSheet,
  stayEnquiryStatusLabel,
  stayEnquiryTone,
  RoomChoice,
  useBookableRooms,
} from "@/features/stays/view/stay-record-sheets";
import { SectionNav } from "@/features/workspace/view/section-nav";

const ENQUIRY_FILTERS = ["OPEN", "CONFIRMED", "CLOSED", "ALL"] as const;
type EnquiryFilter = (typeof ENQUIRY_FILTERS)[number];

const FILTER_LABELS: Record<EnquiryFilter, string> = {
  OPEN: "To call",
  CONFIRMED: "Booked",
  CLOSED: "Closed",
  ALL: "All",
};

/** Enquiries the host still has to call about. */
const OPEN = new Set(["SUBMITTED", "RESPONDED"]);

/** Each tab as the enquiry states the server filters on. Exported for tests. */
export const ENQUIRY_FILTER_STATUSES: Record<EnquiryFilter, string> = {
  OPEN: "SUBMITTED,RESPONDED",
  CONFIRMED: "CONFIRMED",
  CLOSED: "DECLINED,WITHDRAWN,EXPIRED,CANCELLED",
  ALL: "",
};

/**
 * The host's stay inbox. Every stay starts as an enquiry: the host sees who is asking,
 * calls them, and marks the enquiry Booked or Not available. The guest is told either way.
 *
 * The filter rides in `?status=`, so a filtered view is a link a host can keep. The sheet
 * looks its record up in the unfiltered list, so changing the filter cannot blank it.
 */
export function PartnerStayEnquiriesWorkspace() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryStatus = searchParams?.get("status") ?? "";
  const filter = ENQUIRY_FILTERS.includes(queryStatus as EnquiryFilter)
    ? (queryStatus as EnquiryFilter)
    : "OPEN";

  function setFilter(next: EnquiryFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "OPEN") params.delete("status");
    else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const statuses = ENQUIRY_FILTER_STATUSES[filter];
  const enquiries = usePagedList(["partner-stays", "enquiries", statuses], (cursor) =>
    fetchPartnerStayEnquiriesPage(cursor, statuses || undefined),
  );
  // The "To call" count comes from its own first page, so it is right on every tab.
  const open = useQuery({
    queryKey: ["partner-stays", "enquiries", "open-count"],
    queryFn: () => fetchPartnerStayEnquiriesPage(undefined, ENQUIRY_FILTER_STATUSES.OPEN),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  // Booked / Not available straight from the card: the host has just hung up and records the
  // outcome without opening Details. Both still confirm, because both message the guest.
  const [booking, setBooking] = useState<StayEnquiry | null>(null);
  const [declining, setDeclining] = useState<StayEnquiry | null>(null);
  const [roomId, setRoomId] = useState("");
  const [note, setNote] = useState("");
  const rooms = useBookableRooms(booking?.property, booking?.unit);
  useEffect(() => {
    // The room the guest asked about comes first, so the first free one is the likely answer.
    if (booking && !rooms.some((room) => room.id === roomId)) setRoomId(rooms[0]?.id ?? "");
  }, [booking, rooms, roomId]);
  const closeQuick = () => {
    setBooking(null);
    setDeclining(null);
    setNote("");
    setRoomId("");
  };

  const act = useMutation({
    mutationFn: ({
      id,
      action,
      note,
      roomId,
    }: {
      id: string;
      action: "booked" | "not_available" | "cancel";
      note?: string;
      roomId?: string | null;
    }) => {
      if (action === "booked") return confirmPartnerStayEnquiry(id, roomId);
      if (action === "not_available") return respondPartnerStayEnquiry(id, note ?? "", true);
      return cancelPartnerStayEnquiry(id);
    },
    onSuccess: () => {
      closeQuick();
      invalidate();
    },
  });

  const rows = enquiries.items;
  const openCount = open.data
    ? `${open.data.results.length}${open.data.next ? "+" : ""}`
    : "";

  const selected = selectedId
    ? enquiries.items.find((enquiry) => enquiry.id === selectedId) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stays</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Guest enquiries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Call the guest, agree the room and dates, then mark the enquiry Booked (pick the room) or
          Not available. The guest is told either way.
        </p>
      </div>

      <SectionNav label="Stay sections" items={STAY_SECTIONS} />

      <Card>
        <div className="flex flex-wrap gap-2">
          {ENQUIRY_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === option
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {FILTER_LABELS[option]}
              {option === "OPEN" && openCount && openCount !== "0" ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>

        {enquiries.isLoading ? <p className="mt-3 text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(enquiries.error)}</p>
        ) : null}
        {!enquiries.isLoading && !enquiries.error && rows.length === 0 ? (
          <EmptyState
            compact
            className="mt-3"
            title={filter === "OPEN" ? "Nobody to call right now" : "Nothing here"}
            description="New enquiries appear here, with the guest's number."
          />
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((enquiry) => (
            <li key={enquiry.id}>
              <div className="flex flex-col gap-2 rounded-card border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedId(enquiry.id)}
                  className="flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy-900">
                      {enquiry.customer_name || "Guest"}
                    </span>
                    <Badge tone={stayEnquiryTone(enquiry.status)}>
                      {stayEnquiryStatusLabel(enquiry.status)}
                    </Badge>
                  </span>
                  <span className="block text-sm text-text-secondary">
                    {enquiry.property_title} · {enquiry.unit_name ?? "Room"}
                  </span>
                  <span className="block text-sm text-text-secondary">
                    From {formatDate(`${enquiry.check_in}T12:00:00`)}
                    {enquiry.stay_length
                      ? ` · ${stayLengthLabel(enquiry.stay_length, enquiry.price_period)}`
                      : ""}
                    {` · ${(enquiry as { adult_count?: number }).adult_count !== undefined ? `${(enquiry as { adult_count?: number }).adult_count} adult${(enquiry as { adult_count?: number }).adult_count === 1 ? "" : "s"}${(enquiry as { child_count?: number }).child_count ? `, ${(enquiry as { child_count?: number }).child_count} child${(enquiry as { child_count?: number }).child_count === 1 ? "" : "ren"}` : ""}` : `${enquiry.guest_count ?? 1} guest${(enquiry.guest_count ?? 1) === 1 ? "" : "s"}`}`}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                    Details
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </button>
                {OPEN.has(enquiry.status ?? "") ? (
                  <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch lg:flex-row">
                    {enquiry.customer_phone ? (
                      <a
                        href={`tel:${enquiry.customer_phone}`}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-action px-4 py-2 text-sm font-bold text-action-text shadow-sm hover:bg-action-hover sm:flex-none"
                      >
                        <Phone className="size-4" aria-hidden />
                        Call
                      </a>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        act.reset();
                        setRoomId("");
                        setBooking(enquiry);
                      }}
                    >
                      <Check className="size-4" aria-hidden />
                      Booked
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        act.reset();
                        setNote("");
                        setDeclining(enquiry);
                      }}
                    >
                      <X className="size-4" aria-hidden />
                      Not available
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <LoadMore hasMore={enquiries.hasMore} loading={enquiries.loadingMore} onLoadMore={enquiries.loadMore} />
      </Card>

      <StayEnquiryDetailSheet
        enquiry={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            act.reset();
          }
        }}
        onBooked={(id, roomId) => act.mutate({ id, action: "booked", roomId })}
        onNotAvailable={(id, note) => act.mutate({ id, action: "not_available", note })}
        onCancelBooking={(id) => act.mutate({ id, action: "cancel" })}
        isPending={act.isPending}
        actionError={act.error ? friendlyErrorMessage(act.error) : null}
      />

      <Dialog
        open={booking !== null}
        onOpenChange={(next) => !next && closeQuick()}
        title="Booking confirmed?"
        description={
          booking
            ? `${booking.customer_name || "The guest"} is taking a room at ${booking.property_title}. It shows as Booked and stops appearing as available. The guest is told.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={closeQuick}>
              Not yet
            </Button>
            <Button
              loading={act.isPending}
              loadingLabel="Saving…"
              onClick={() => booking && act.mutate({ id: booking.id, action: "booked", roomId: roomId || null })}
            >
              Yes – Mark Room Booked
            </Button>
          </>
        }
      >
        <RoomChoice rooms={rooms} value={roomId} onChange={setRoomId} />
        {act.error ? (
          <p role="alert" className="mt-2 text-sm text-danger-text">
            {friendlyErrorMessage(act.error)}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={declining !== null}
        onOpenChange={(next) => !next && closeQuick()}
        title="Room not available?"
        description={
          declining
            ? `${declining.customer_name || "The guest"} is told the room is not available. A note is optional.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={closeQuick}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel="Sending…"
              onClick={() =>
                declining && act.mutate({ id: declining.id, action: "not_available", note: note.trim() })
              }
            >
              Tell the guest
            </Button>
          </>
        }
      >
        <Field label="Note for the guest" showOptional>
          <Textarea
            value={note}
            rows={3}
            maxLength={480}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Fully occupied till the 20th."
          />
        </Field>
        {act.error ? (
          <p role="alert" className="mt-2 text-sm text-danger-text">
            {friendlyErrorMessage(act.error)}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
