"use client";

import {
  Button,
  FactList,
  Field,
  Readout,
  Sheet,
  Textarea,
  Timeline,
  TimelineEvent,
  cn,
  formatDate,
  formatDateTime,
  formatMoney,
  useT,
} from "@vsolve/ui";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InvoiceNotice } from "@/features/workspace/view/invoice-notice";
import {
  byRoomNumber,
  fetchPartnerStayProperties,
  stayLengthLabel,
  type StayEnquiry,
} from "@/features/stays/queries";

type Translate = ReturnType<typeof useT>;

/** "2 adults, 1 child" — the party a guest booked for. */
export function adultsAndChildren(adults: number, children: number | undefined, t: Translate): string {
  const adultText = t("stays.guests.adults", { count: adults });
  return children ? `${adultText}, ${t("stays.guests.children", { count: children })}` : adultText;
}

/**
 * "Which room?" for Mark as Booked. Lists the property's rooms that aren't booked, grouped by
 * type, with the enquired type first.
 */
export function useBookableRooms(propertyId: string | undefined, preferUnitId?: string | null) {
  const t = useT();
  const properties = useQuery({
    queryKey: ["partner-stays", "properties"],
    queryFn: fetchPartnerStayProperties,
    enabled: Boolean(propertyId),
  });
  return useMemo(() => {
    const property = properties.data?.find((row) => row.id === propertyId);
    const units = [...(property?.units ?? [])].sort((a, b) =>
      a.id === preferUnitId ? -1 : b.id === preferUnitId ? 1 : 0,
    );
    return units.flatMap((unit) =>
      [...(unit.rooms ?? [])]
        .filter((room) => room.status !== "BOOKED")
        .sort(byRoomNumber)
        .map((room) => ({
          id: room.id,
          label:
            room.status === "UNAVAILABLE"
              ? t("stays.roomChoice.optionOff", { number: room.number, name: unit.name })
              : `${room.number} · ${unit.name}`,
        })),
    );
  }, [properties.data, propertyId, preferUnitId, t]);
}

export function RoomChoice({
  rooms,
  value,
  onChange,
}: {
  rooms: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  if (rooms.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        {t("stays.roomChoice.allBooked")}
      </p>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-navy-900">{t("stays.roomChoice.label")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-control border border-line bg-surface px-3 text-sm text-text"
      >
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface StayReservationRow {
  id: string;
  property_title?: string;
  unit_name?: string;
  customer_name?: string;
  customer_phone?: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_count?: number;
  nights?: number;
  total_paise?: number;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
}

/**
 * Status words for a reservation.
 *
 * Written out rather than shown raw, because `PAYMENT_PENDING` and `NO_SHOW`
 * are server enum members, not English. The list and the detail sheet both read
 * from here so the same row cannot be called two things on one screen.
 */
export const STAY_RESERVATION_STATUS_LABELS: Record<string, string> = {
  HELD: "stays.reservationStatus.held",
  PAYMENT_PENDING: "stays.reservationStatus.paymentPending",
  CONFIRMED: "stays.reservationStatus.confirmed",
  CHECKED_IN: "stays.reservationStatus.checkedIn",
  CHECKED_OUT: "stays.reservationStatus.checkedOut",
  CANCELLED: "stays.reservationStatus.cancelled",
  NO_SHOW: "stays.reservationStatus.noShow",
};

export function stayReservationStatusLabel(status: string | undefined, t: Translate): string {
  if (!status) return t("stays.status.unknown");
  const key = STAY_RESERVATION_STATUS_LABELS[status];
  return key ? t(key) : status;
}

/**
 * The settled states a reservation can be in, which color the badge.
 *
 * A cancelled stay and a no-show are both endings, but only one of them is the
 * partner's loss to absorb, so both read as `danger` while a confirmed one is
 * `success`. `HELD` and `PAYMENT_PENDING` are `neutral` rather than `warning`:
 * an unpaid hold is the normal first minute of a booking, not a problem to
 * chase.
 */
export function stayReservationTone(
  status: string | undefined,
): "success" | "neutral" | "danger" {
  if (status === "CANCELLED" || status === "NO_SHOW") return "danger";
  if (status === "CONFIRMED" || status === "CHECKED_IN" || status === "CHECKED_OUT") {
    return "success";
  }
  return "neutral";
}

/**
 * What a guest's contact details are, or a plain statement that there are none.
 *
 * `FactTile`'s locked plate exists for a withheld value; these two cases are
 * different from that. A reservation carries the guest's name and number, so it
 * renders them. An enquiry carries neither — there is nothing withheld, the
 * fields simply do not exist on the wire — so the block says so instead of
 * drawing an empty row a partner would read as a loading bug.
 */
function GuestBlock({
  name,
  phone,
  note,
}: {
  name?: string | null;
  phone?: string | null;
  note: string;
}) {
  const t = useT();
  if (name || phone) {
    return (
      <FactList
        items={[
          { label: t("stays.sheet.name"), value: name || "—" },
          { label: t("stays.sheet.phone"), value: phone || "—" },
        ]}
      />
    );
  }

  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3">
      <p className="text-sm font-medium text-text-muted">{t("stays.sheet.notProvided")}</p>
      <p className="mt-1 text-xs text-text-secondary">{note}</p>
    </div>
  );
}

function SheetSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Today as `YYYY-MM-DD` in the host's local time, to compare with a stay's dates. */
function localIsoDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

const CANCELLABLE_RESERVATION_STATUSES = new Set(["HELD", "PAYMENT_PENDING", "CONFIRMED"]);

export function StayReservationDetailSheet({
  reservation,
  onOpenChange,
  onCheckIn,
  onCheckOut,
  onNoShow,
  onCancel,
  isPending,
  actionError,
}: {
  reservation: StayReservationRow | null;
  onOpenChange: (open: boolean) => void;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string, reason: string) => void;
  isPending: boolean;
  actionError?: string | null;
}) {
  const t = useT();
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const reservationId = reservation?.id ?? null;
  useEffect(() => {
    setCancelling(false);
    setCancelReason("");
    setCancelError(null);
  }, [reservationId]);

  const stayHasStarted = reservation ? localIsoDate() >= reservation.check_in : false;
  const canCancel = reservation ? CANCELLABLE_RESERVATION_STATUSES.has(reservation.status) : false;
  const nights = reservation?.nights ?? 0;
  const total = reservation?.total_paise;
  const perNight =
    nights > 0 && typeof total === "number" ? Math.round(total / nights) : null;

  const timeline: Array<{ title: string; at: string; tone: "neutral" | "success" | "danger" }> =
    [];
  if (reservation?.created_at) {
    timeline.push({ title: t("stays.reservation.event.booked"), at: reservation.created_at, tone: "neutral" });
  }
  if (reservation?.checked_in_at) {
    timeline.push({ title: t("stays.reservationStatus.checkedIn"), at: reservation.checked_in_at, tone: "success" });
  }
  if (reservation?.checked_out_at) {
    timeline.push({ title: t("stays.reservationStatus.checkedOut"), at: reservation.checked_out_at, tone: "neutral" });
  }
  if (reservation?.cancelled_at) {
    timeline.push({ title: t("stays.reservationStatus.cancelled"), at: reservation.cancelled_at, tone: "danger" });
  }

  return (
    <Sheet
      side="end"
      open={reservation !== null}
      onOpenChange={onOpenChange}
      title={
        reservation
          ? `${reservation.property_title ?? t("stays.bookings.fallbackStay")} · ${
              reservation.unit_name ?? t("stays.bookings.fallbackRoom")
            }`
          : ""
      }
      description={
        reservation ? stayReservationStatusLabel(reservation.status, t) : undefined
      }
      footer={
        reservation ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            {canCancel && !cancelling ? (
              <Button variant="ghost" disabled={isPending} onClick={() => setCancelling(true)}>
                {t("stays.sheet.cancelBooking")}
              </Button>
            ) : null}
            {reservation.status === "CONFIRMED" && stayHasStarted ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onNoShow(reservation.id)}
              >
                {t("stays.reservation.noShow")}
              </Button>
            ) : null}
            {reservation.status === "CONFIRMED" ? (
              <Button
                disabled={isPending || !stayHasStarted}
                onClick={() => onCheckIn(reservation.id)}
              >
                {t("stays.reservation.checkIn")}
              </Button>
            ) : null}
            {reservation.status === "CHECKED_IN" ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onCheckOut(reservation.id)}
              >
                {t("stays.reservation.checkOut")}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {reservation ? (
        <div className="flex flex-col gap-5 py-3">
          {actionError ? <p className="text-sm text-danger-text">{actionError}</p> : null}
          {reservation.status === "CONFIRMED" && !stayHasStarted ? (
            <p className="text-sm text-text-secondary">
              {t("stays.reservation.checkInFrom", {
                date: formatDate(`${reservation.check_in}T12:00:00`),
              })}
            </p>
          ) : null}

          {cancelling ? (
            <SheetSection title={t("stays.reservation.cancelTitle")}>
              <p className="text-sm text-text-secondary">
                {t("stays.reservation.cancelBody")}
              </p>
              <Field label={t("stays.reservation.reason")} required error={cancelError ?? undefined}>
                <Textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(event) => {
                    setCancelReason(event.target.value);
                    setCancelError(null);
                  }}
                  placeholder={t("stays.reservation.reasonPlaceholder")}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={isPending}
                  onClick={() => {
                    if (!cancelReason.trim()) {
                      setCancelError(t("stays.reservation.reasonMissing"));
                      return;
                    }
                    onCancel(reservation.id, cancelReason.trim());
                  }}
                >
                  {t("stays.reservation.cancelAndRefund")}
                </Button>
                <Button variant="ghost" disabled={isPending} onClick={() => setCancelling(false)}>
                  {t("stays.reservation.keepBooking")}
                </Button>
              </div>
            </SheetSection>
          ) : null}

          <SheetSection title={t("stays.sheet.guest")}>
            <GuestBlock
              name={reservation.customer_name}
              phone={reservation.customer_phone}
              note={t("stays.reservation.noContact")}
            />
          </SheetSection>

          <SheetSection title={t("stays.reservation.stay")}>
            <FactList
              items={[
                {
                  label: t("stays.reservation.checkIn"),
                  value: formatDate(`${reservation.check_in}T12:00:00`),
                },
                {
                  label: t("stays.reservation.checkOut"),
                  value: formatDate(`${reservation.check_out}T12:00:00`),
                },
                { label: t("stays.reservation.nights"), value: String(nights) },
                {
                  label: t("stays.sheet.guests"),
                  value:
                    (reservation as { adult_count?: number }).adult_count !== undefined
                      ? adultsAndChildren(
                          (reservation as { adult_count?: number }).adult_count!,
                          (reservation as { child_count?: number }).child_count,
                          t,
                        )
                      : String(reservation.guest_count ?? 0),
                },
                { label: t("stays.sheet.room"), value: reservation.unit_name ?? "—" },
              ]}
            />
          </SheetSection>

          <SheetSection title={t("stays.reservation.amounts")}>
            <Readout
              label={t("stays.reservation.total")}
              value={typeof total === "number" ? formatMoney(total) : "—"}
              tone="active"
              size="sm"
              caption={nights > 0 ? t("stays.reservation.acrossNights", { count: nights }) : undefined}
            />
            {perNight !== null ? (
              <FactList items={[{ label: t("stays.reservation.perNight"), value: formatMoney(perNight) }]} />
            ) : null}
            <InvoiceNotice />
          </SheetSection>

          {timeline.length > 0 ? (
            <SheetSection title={t("stays.sheet.history")}>
              <Timeline label={t("stays.reservation.historyAria")}>
                {timeline.map((event) => (
                  <TimelineEvent
                    key={event.title}
                    title={event.title}
                    timestamp={formatDateTime(event.at)}
                    tone={event.tone}
                  />
                ))}
              </Timeline>
            </SheetSection>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Words for an enquiry's status, shared by the inbox list and the sheet. */
export const STAY_ENQUIRY_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "stays.enquiryStatus.submitted",
  RESPONDED: "stays.enquiryStatus.responded",
  CONFIRMED: "stays.enquiryStatus.confirmed",
  DECLINED: "stays.enquiryStatus.declined",
  CANCELLED: "stays.enquiryStatus.cancelled",
  WITHDRAWN: "stays.enquiryStatus.withdrawn",
  EXPIRED: "stays.enquiryStatus.expired",
};

export function stayEnquiryStatusLabel(status: string | undefined, t: Translate): string {
  if (!status) return t("stays.status.unknown");
  const key = STAY_ENQUIRY_STATUS_LABELS[status];
  return key ? t(key) : status;
}

export function stayEnquiryTone(status: string | undefined): "success" | "neutral" | "danger" | "info" {
  if (status === "SUBMITTED") return "info";
  if (status === "CONFIRMED") return "success";
  if (status === "DECLINED" || status === "CANCELLED") return "danger";
  return "neutral";
}

const OPEN_ENQUIRY_STATUSES = new Set(["SUBMITTED", "RESPONDED"]);

/**
 * One guest enquiry: who is asking, what they want, and a number to call.
 *
 * Stays are agreed on the phone. The host calls, then records the outcome — Booked or
 * Not available — and the guest is told either way. No money moves here.
 */
export function StayEnquiryDetailSheet({
  enquiry,
  onOpenChange,
  onBooked,
  onNotAvailable,
  onCancelBooking,
  isPending,
  actionError,
}: {
  enquiry: StayEnquiry | null;
  onOpenChange: (open: boolean) => void;
  onBooked: (id: string, roomId: string | null) => void;
  onNotAvailable: (id: string, note: string) => void;
  onCancelBooking: (id: string) => void;
  isPending: boolean;
  actionError?: string | null;
}) {
  const t = useT();
  const [declining, setDeclining] = useState(false);
  const [booking, setBooking] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [note, setNote] = useState("");
  const rooms = useBookableRooms(enquiry?.property, enquiry?.unit);

  // A note typed against one enquiry must not follow the reader to the next.
  useEffect(() => {
    setDeclining(false);
    setBooking(false);
    setNote("");
  }, [enquiry?.id]);
  useEffect(() => {
    if (booking && !rooms.some((room) => room.id === roomId)) setRoomId(rooms[0]?.id ?? "");
  }, [booking, rooms, roomId]);

  const isOpen = enquiry ? OPEN_ENQUIRY_STATUSES.has(enquiry.status ?? "") : false;
  const length = enquiry?.stay_length
    ? stayLengthLabel(enquiry.stay_length, enquiry.price_period, t)
    : t("stays.enquiry.nightsFallback", { n: enquiry?.nights ?? 0 });

  return (
    <Sheet
      side="end"
      open={enquiry !== null}
      onOpenChange={onOpenChange}
      title={enquiry?.customer_name || t("stays.enquiry.titleFallback")}
      description={
        enquiry
          ? `${stayEnquiryStatusLabel(enquiry.status, t)} · ${enquiry.property_title} · ${
              enquiry.unit_name ?? t("stays.bookings.fallbackRoom")
            }`
          : undefined
      }
      footer={
        enquiry && isOpen && booking ? (
          <>
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => setBooking(false)}>
              {t("stays.enquiry.notYet")}
            </Button>
            <Button
              type="button"
              loading={isPending}
              loadingLabel={t("stays.visitingHours.saving")}
              onClick={() => onBooked(enquiry.id, roomId || null)}
            >
              {t("stays.enquiry.confirmBooked")}
            </Button>
          </>
        ) : enquiry && isOpen && !declining ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setDeclining(true)}
            >
              {t("stays.enquiryStatus.declined")}
            </Button>
            <Button
              type="button"
              loading={isPending}
              loadingLabel={t("stays.visitingHours.saving")}
              onClick={() => setBooking(true)}
            >
              {t("stays.enquiry.markBooked")}
            </Button>
          </>
        ) : enquiry && enquiry.status === "CONFIRMED" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending}
              onClick={() => onCancelBooking(enquiry.id)}
            >
              {t("stays.sheet.cancelBooking")}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        )
      }
    >
      {enquiry ? (
        <div className="flex flex-col gap-5 py-3">
          {actionError ? <p className="text-sm text-danger-text">{actionError}</p> : null}

          <SheetSection title={t("stays.sheet.guest")}>
            <FactList
              items={[
                { label: t("stays.sheet.name"), value: enquiry.customer_name || "—" },
                { label: t("stays.sheet.phone"), value: enquiry.customer_phone || "—" },
              ]}
            />
            {enquiry.customer_phone ? (
              <a
                href={`tel:${enquiry.customer_phone}`}
                className="inline-flex items-center justify-center gap-2 rounded-control bg-action px-4 py-2.5 text-sm font-bold text-action-text shadow-sm hover:bg-action-hover"
              >
                <Phone className="size-4" aria-hidden />
                {t("stays.enquiry.call", {
                  name: enquiry.customer_name?.split(" ")[0] || t("stays.enquiry.guestFallback"),
                })}
              </a>
            ) : null}
            {isOpen ? (
              <p className="text-xs text-text-secondary">
                {t("stays.enquiry.callHint")}
              </p>
            ) : null}
          </SheetSection>

          <SheetSection title={t("stays.enquiry.wantsToStay")}>
            <FactList
              items={[
                { label: t("stays.enquiry.from"), value: formatDate(`${enquiry.check_in}T12:00:00`) },
                { label: t("stays.enquiry.for"), value: length },
                {
                  label: t("stays.sheet.guests"),
                  value:
                    (enquiry as { adult_count?: number }).adult_count !== undefined
                      ? `${adultsAndChildren(
                          (enquiry as { adult_count?: number }).adult_count!,
                          (enquiry as { child_count?: number }).child_count,
                          t,
                        )} ${t("stays.guests.total", {
                          n:
                            enquiry.guest_count ??
                            (enquiry as { adult_count?: number }).adult_count! +
                              ((enquiry as { child_count?: number }).child_count ?? 0),
                        })}`
                      : t("stays.guests.count", { count: enquiry.guest_count ?? 1 }),
                },
                { label: t("stays.sheet.room"), value: enquiry.unit_name ?? "—" },
                {
                  label: t("stays.enquiry.estimate"),
                  value:
                    typeof enquiry.total_quote_paise === "number" && enquiry.total_quote_paise > 0
                      ? formatMoney(enquiry.total_quote_paise)
                      : "—",
                },
              ]}
            />
          </SheetSection>

          {enquiry.message ? (
            <SheetSection title={t("stays.enquiry.message")}>
              <p className="text-sm text-text">{enquiry.message}</p>
            </SheetSection>
          ) : null}

          {booking && isOpen ? (
            <SheetSection title={t("stays.enquiry.bookingConfirmed")}>
              <p className="text-sm text-text-secondary">
                {t("stays.enquiry.bookedBody")}
              </p>
              <RoomChoice rooms={rooms} value={roomId} onChange={setRoomId} />
            </SheetSection>
          ) : null}

          {declining ? (
            <SheetSection title={t("stays.enquiryStatus.declined")}>
              <Field label={t("stays.enquiry.noteLabel")} showOptional>
                <Textarea
                  value={note}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("stays.enquiry.notePlaceholder")}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={isPending}
                  onClick={() => onNotAvailable(enquiry.id, note.trim())}
                >
                  {t("stays.enquiry.tellGuest")}
                </Button>
                <Button variant="ghost" disabled={isPending} onClick={() => setDeclining(false)}>
                  {t("common.back")}
                </Button>
              </div>
            </SheetSection>
          ) : null}

          {enquiry.host_response && !isOpen ? (
            <SheetSection title={t("stays.enquiry.yourNote")}>
              <p className="text-sm text-text">{enquiry.host_response}</p>
            </SheetSection>
          ) : null}

          <SheetSection title={t("stays.sheet.history")}>
            <Timeline label={t("stays.enquiry.historyAria")}>
              <TimelineEvent title={t("stays.enquiry.received")} timestamp={formatDateTime(enquiry.created_at)} />
              {enquiry.responded_at ? (
                <TimelineEvent
                  title={stayEnquiryStatusLabel(enquiry.status, t)}
                  timestamp={formatDateTime(enquiry.responded_at)}
                  tone={enquiry.status === "DECLINED" ? "danger" : "success"}
                />
              ) : null}
            </Timeline>
          </SheetSection>
        </div>
      ) : null}
    </Sheet>
  );
}
