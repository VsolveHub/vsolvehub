"use client";

import {
  Badge,
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
} from "@vsolve/ui";
import { useEffect, useState } from "react";

import { InvoiceNotice } from "@/features/workspace/view/invoice-notice";
import type { StayEnquiry } from "@/features/stays/queries";

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
  HELD: "Held",
  PAYMENT_PENDING: "Payment pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

export function stayReservationStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  return STAY_RESERVATION_STATUS_LABELS[status] ?? status;
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
  if (name || phone) {
    return (
      <FactList
        items={[
          { label: "Name", value: name || "—" },
          { label: "Phone", value: phone || "—" },
        ]}
      />
    );
  }

  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3">
      <p className="text-sm font-medium text-text-muted">Not provided</p>
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
    timeline.push({ title: "Booked", at: reservation.created_at, tone: "neutral" });
  }
  if (reservation?.checked_in_at) {
    timeline.push({ title: "Checked in", at: reservation.checked_in_at, tone: "success" });
  }
  if (reservation?.checked_out_at) {
    timeline.push({ title: "Checked out", at: reservation.checked_out_at, tone: "neutral" });
  }
  if (reservation?.cancelled_at) {
    timeline.push({ title: "Cancelled", at: reservation.cancelled_at, tone: "danger" });
  }

  return (
    <Sheet
      side="end"
      open={reservation !== null}
      onOpenChange={onOpenChange}
      title={reservation ? `${reservation.property_title ?? "Stay"} · ${reservation.unit_name ?? "Room"}` : ""}
      description={
        reservation ? stayReservationStatusLabel(reservation.status) : undefined
      }
      footer={
        reservation ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {canCancel && !cancelling ? (
              <Button variant="ghost" disabled={isPending} onClick={() => setCancelling(true)}>
                Cancel booking
              </Button>
            ) : null}
            {reservation.status === "CONFIRMED" && stayHasStarted ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onNoShow(reservation.id)}
              >
                Guest didn’t arrive
              </Button>
            ) : null}
            {reservation.status === "CONFIRMED" ? (
              <Button
                disabled={isPending || !stayHasStarted}
                onClick={() => onCheckIn(reservation.id)}
              >
                Check in
              </Button>
            ) : null}
            {reservation.status === "CHECKED_IN" ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onCheckOut(reservation.id)}
              >
                Check out
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
              You can check the guest in from{" "}
              {formatDate(`${reservation.check_in}T12:00:00`)}.
            </p>
          ) : null}

          {cancelling ? (
            <SheetSection title="Cancel this booking">
              <p className="text-sm text-text-secondary">
                The guest is refunded in full and the room opens up again. Tell them why — they
                will see this message.
              </p>
              <Field label="Reason" required error={cancelError ?? undefined}>
                <Textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(event) => {
                    setCancelReason(event.target.value);
                    setCancelError(null);
                  }}
                  placeholder="e.g. Water damage in the room — we can’t host you on these dates."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={isPending}
                  onClick={() => {
                    if (!cancelReason.trim()) {
                      setCancelError("Add a reason for the guest.");
                      return;
                    }
                    onCancel(reservation.id, cancelReason.trim());
                  }}
                >
                  Cancel and refund guest
                </Button>
                <Button variant="ghost" disabled={isPending} onClick={() => setCancelling(false)}>
                  Keep booking
                </Button>
              </div>
            </SheetSection>
          ) : null}

          <SheetSection title="Guest">
            <GuestBlock
              name={reservation.customer_name}
              phone={reservation.customer_phone}
              note="This booking has no guest contact details."
            />
          </SheetSection>

          <SheetSection title="Stay">
            <FactList
              items={[
                {
                  label: "Check in",
                  value: formatDate(`${reservation.check_in}T12:00:00`),
                },
                {
                  label: "Check out",
                  value: formatDate(`${reservation.check_out}T12:00:00`),
                },
                { label: "Nights", value: String(nights) },
                { label: "Guests", value: String(reservation.guest_count ?? 0) },
                { label: "Room", value: reservation.unit_name ?? "—" },
              ]}
            />
          </SheetSection>

          <SheetSection title="Amounts">
            <Readout
              label="Booking total"
              value={typeof total === "number" ? formatMoney(total) : "—"}
              tone="active"
              size="sm"
              caption={nights > 0 ? `Across ${nights} night${nights === 1 ? "" : "s"}` : undefined}
            />
            {perNight !== null ? (
              <FactList items={[{ label: "Per night (average)", value: formatMoney(perNight) }]} />
            ) : null}
            <InvoiceNotice />
          </SheetSection>

          {timeline.length > 0 ? (
            <SheetSection title="History">
              <Timeline label="Reservation history">
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

export function StayEnquiryDetailSheet({
  enquiry,
  onOpenChange,
  onRespond,
  onDecline,
  onCancel,
  isPending,
}: {
  enquiry: StayEnquiry | null;
  onOpenChange: (open: boolean) => void;
  onRespond: (id: string, response: string) => void;
  onDecline: (id: string, response: string) => void;
  onCancel: (id: string) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState("");

  // A reply typed against one enquiry must not follow the reader to the next.
  useEffect(() => {
    setDraft("");
  }, [enquiry?.id]);

  const canReply = enquiry?.status === "SUBMITTED";

  return (
    <Sheet
      side="end"
      open={enquiry !== null}
      onOpenChange={onOpenChange}
      title={enquiry?.property_title ?? "Enquiry"}
      description={enquiry ? `${enquiry.status} · ${enquiry.unit_name ?? "Room"}` : undefined}
      footer={
        canReply ? (
          <>
            <Button
              type="button"
              variant="danger"
              disabled={isPending}
              onClick={() => enquiry && onCancel(enquiry.id)}
            >
              Cancel enquiry
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || !draft.trim()}
              onClick={() => enquiry && draft.trim() && onDecline(enquiry.id, draft.trim())}
            >
              Decline
            </Button>
            <Button
              type="button"
              loading={isPending}
              loadingLabel="Sending…"
              disabled={!draft.trim()}
              onClick={() => enquiry && draft.trim() && onRespond(enquiry.id, draft.trim())}
            >
              Respond
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        )
      }
    >
      {enquiry ? (
        <div className="flex flex-col gap-5 py-3">
          <SheetSection title="Guest">
            <GuestBlock
              note="An enquiry does not carry the guest's name or number today, so there is nobody to call before you respond."
            />
          </SheetSection>

          <SheetSection title="Requested stay">
            <FactList
              items={[
                { label: "Check in", value: formatDate(`${enquiry.check_in}T12:00:00`) },
                { label: "Check out", value: formatDate(`${enquiry.check_out}T12:00:00`) },
                { label: "Nights", value: String(enquiry.nights ?? 0) },
                { label: "Guests", value: String(enquiry.guest_count ?? 0) },
              ]}
            />
          </SheetSection>

          <SheetSection title="Quote">
            <Readout
              label="Quoted total"
              value={
                typeof enquiry.total_quote_paise === "number"
                  ? formatMoney(enquiry.total_quote_paise)
                  : "—"
              }
              tone="active"
              size="sm"
            />
            {typeof enquiry.nightly_rate_paise === "number" ? (
              <FactList
                items={[
                  { label: "Nightly rate", value: formatMoney(enquiry.nightly_rate_paise) },
                ]}
              />
            ) : null}
            <InvoiceNotice>
              An enquiry has no invoice. A tax invoice is raised on the booking, and Partner accounts cannot read it yet.
            </InvoiceNotice>
          </SheetSection>

          {enquiry.message ? (
            <SheetSection title="Guest message">
              <p className="text-sm text-text">{enquiry.message}</p>
            </SheetSection>
          ) : null}

          {canReply ? (
            <SheetSection title="Your response">
              <Field label="Reply to the guest" required>
                <Textarea
                  value={draft}
                  rows={4}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Confirm the dates, the rate and anything they should know before booking."
                />
              </Field>
            </SheetSection>
          ) : enquiry.host_response ? (
            <SheetSection title="Your response">
              <p className="text-sm text-text">{enquiry.host_response}</p>
            </SheetSection>
          ) : null}

          <SheetSection title="History">
            <Timeline label="Enquiry history">
              <TimelineEvent title="Enquiry sent" timestamp={formatDateTime(enquiry.created_at)} />
              {enquiry.responded_at ? (
                <TimelineEvent
                  title={enquiry.status === "DECLINED" ? "Declined" : "Responded"}
                  timestamp={formatDateTime(enquiry.responded_at)}
                  tone={enquiry.status === "DECLINED" ? "danger" : "success"}
                />
              ) : null}
            </Timeline>
          </SheetSection>

          <Badge tone="neutral" className="self-start">
            {enquiry.status}
          </Badge>
        </div>
      ) : null}
    </Sheet>
  );
}
