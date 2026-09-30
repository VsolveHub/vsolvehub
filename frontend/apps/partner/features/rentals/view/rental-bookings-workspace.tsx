"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Textarea, formatDate, formatMoney } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import type { BookingAction } from "@/features/rentals/booking-actions";
import {
  fetchPartnerRentalBookings,
  partnerRentalBookingAction,
} from "@/features/rentals/queries";
import { RentalBookingDetailSheet, rentalBookingStatusLabel, rentalBookingTone } from "@/features/rentals/view/rental-booking-sheet";
import { RENTAL_SECTIONS } from "@/features/rentals/view/rental-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

const BOOKING_STATUS_FILTERS = [
  "ALL",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "HANDOVER",
  "RETURNED",
  "CANCELLED",
  "DISPUTED",
] as const;

type BookingStatusFilter = (typeof BOOKING_STATUS_FILTERS)[number];

type BookingActionBody = { pin?: string; reason?: string; consume_paise: number };

type HandoverModal = { bookingId: string; pin: string; error: string | null };
type DisputeModal = {
  bookingId: string;
  reason: string;
  consumeRupees: string;
  error: string | null;
};
type CancelModal = { bookingId: string; reason: string; error: string | null };

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

/**
 * Rental bookings — the demand side of the ads, on their own route.
 *
 * Lifted out of `rentals-workspace.tsx`, where the bookings card sat below the
 * post-an-ad form. A host checking what is going out this morning was scrolling
 * past the form they fill in once a month to reach it.
 *
 * ## Why the actions moved into the panel
 *
 * The row used to carry "Confirm handover" and "Raise deposit dispute" directly,
 * beside a summary that showed neither the customer nor the deposit. Handover
 * asks for the customer's 4-digit PIN; a dispute names a reason and an amount to
 * consume. Both are decisions the row could not show the evidence for, so the
 * row is now a summary and the panel holds the commands and the numbers behind
 * them.
 *
 * ## Why an action closes the panel before opening a dialog
 *
 * Handover, dispute and cancel each need input. Opening that dialog on top of
 * the panel would stack two modal layers in the top layer, and the second one
 * would be the only thing a reader could see of the first. Closing the panel
 * first makes each step one decision.
 */
export function PartnerRentalBookingsWorkspace() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [handoverModal, setHandoverModal] = useState<HandoverModal | null>(null);
  const [disputeModal, setDisputeModal] = useState<DisputeModal | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModal | null>(null);

  const queryStatus = searchParams?.get("status") ?? "";
  const bookingStatusFilter = BOOKING_STATUS_FILTERS.includes(queryStatus as BookingStatusFilter)
    ? (queryStatus as BookingStatusFilter)
    : "ALL";

  function setBookingStatusFilter(status: BookingStatusFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const bookings = useQuery({
    queryKey: ["partner-rentals", "bookings", bookingStatusFilter],
    queryFn: () =>
      fetchPartnerRentalBookings(bookingStatusFilter === "ALL" ? undefined : bookingStatusFilter),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
  };

  const act = useMutation({
    mutationFn: (input: { id: string; action: BookingAction; body?: BookingActionBody }) =>
      partnerRentalBookingAction(input.id, input.action, input.body),
    onSuccess: () => {
      setHandoverModal(null);
      setDisputeModal(null);
      setCancelModal(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const message = friendlyErrorMessage(err);
      setHandoverModal((current) => (current ? { ...current, error: message } : current));
      setDisputeModal((current) => (current ? { ...current, error: message } : current));
      setCancelModal((current) => (current ? { ...current, error: message } : current));
    },
  });

  // Defensive client filter in case the API ignores `?status=` (stays enquiry pattern).
  const filteredBookings = useMemo(() => {
    const rows = bookings.data ?? [];
    if (bookingStatusFilter === "ALL") return rows;
    return rows.filter((booking) => (booking.status ?? "").toUpperCase() === bookingStatusFilter);
  }, [bookings.data, bookingStatusFilter]);

  // Looked up in the unfiltered list, so changing the filter while the panel is
  // open cannot blank the record the partner is reading.
  const selected = selectedId
    ? (bookings.data ?? []).find((booking) => booking.id === selectedId) ?? null
    : null;

  function runBookingAction(bookingId: string, action: BookingAction) {
    if (action === "handover") {
      setSelectedId(null);
      setHandoverModal({ bookingId, pin: "", error: null });
      return;
    }
    if (action === "dispute-deposit") {
      setSelectedId(null);
      setDisputeModal({ bookingId, reason: "", consumeRupees: "", error: null });
      return;
    }
    if (action === "cancel") {
      setSelectedId(null);
      setCancelModal({ bookingId, reason: "", error: null });
      return;
    }
    act.mutate({ id: bookingId, action, body: { consume_paise: 0 } });
  }

  function confirmHandover() {
    if (!handoverModal) return;
    const pin = handoverModal.pin.trim();
    if (!/^\d{4}$/.test(pin)) {
      setHandoverModal({
        ...handoverModal,
        error: "Enter the 4-digit handover PIN from the customer.",
      });
      return;
    }
    act.mutate({
      id: handoverModal.bookingId,
      action: "handover",
      body: { pin, consume_paise: 0 },
    });
  }

  function confirmDispute() {
    if (!disputeModal) return;
    const reason = disputeModal.reason.trim();
    if (!reason) {
      setDisputeModal({ ...disputeModal, error: "Add a reason for the deposit dispute." });
      return;
    }
    // Blank consume = 0 (none). Always send consume_paise so the server never
    // treats a missing field as full deposit consume.
    let consumePaise = 0;
    if (disputeModal.consumeRupees.trim()) {
      const parsed = rupeesToPaise(disputeModal.consumeRupees);
      if (parsed == null || parsed < 0) {
        setDisputeModal({
          ...disputeModal,
          error: "Enter a valid consume amount in rupees, or leave blank for none.",
        });
        return;
      }
      consumePaise = parsed;
    }
    act.mutate({
      id: disputeModal.bookingId,
      action: "dispute-deposit",
      body: { reason, consume_paise: consumePaise },
    });
  }

  function confirmCancel() {
    if (!cancelModal) return;
    act.mutate({
      id: cancelModal.bookingId,
      action: "cancel",
      body: { reason: cancelModal.reason.trim(), consume_paise: 0 },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Rentals</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Bookings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Customer reservations across your rental ads. Open one for the amounts, the deposit and
          handover.
        </p>
      </div>

      <SectionNav label="Rental sections" items={RENTAL_SECTIONS} />

      <Card>
        <div className="flex flex-wrap gap-2">
          {BOOKING_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setBookingStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                bookingStatusFilter === status
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {rentalBookingStatusLabel(status)}
            </button>
          ))}
        </div>

        {bookings.isLoading ? <p className="mt-3 text-sm text-text-secondary">Loading…</p> : null}
        {bookings.error ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(bookings.error)}</p>
        ) : null}
        {act.isError && !handoverModal && !disputeModal && !cancelModal ? (
          <p className="mt-3 text-sm text-danger-text">{friendlyErrorMessage(act.error)}</p>
        ) : null}
        {!bookings.isLoading && !bookings.error && filteredBookings.length === 0 ? (
          <EmptyState
            compact
            className="mt-3"
            title={
              bookingStatusFilter === "ALL"
                ? "No bookings yet"
                : `No ${rentalBookingStatusLabel(bookingStatusFilter).toLowerCase()} bookings`
            }
            description={
              bookingStatusFilter === "ALL"
                ? "Bookings appear here after a customer reserves an asset."
                : "Try another status filter to see more."
            }
          />
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {filteredBookings.map((booking) => (
            <li key={booking.id}>
              <button
                type="button"
                onClick={() => setSelectedId(booking.id)}
                className="w-full rounded-card border border-line p-3 text-left transition hover:border-line-strong hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-navy-900">{booking.asset.title}</span>
                  <Badge tone={rentalBookingTone(booking.status)}>
                    {rentalBookingStatusLabel(booking.status)}
                  </Badge>
                </span>
                <span className="block text-sm text-text-secondary">
                  {formatMoney(booking.price_paise)} · {formatDate(booking.start_date)} –{" "}
                  {formatDate(booking.end_date)}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                  View booking
                  <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <RentalBookingDetailSheet
        booking={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onAction={runBookingAction}
        isPending={act.isPending}
      />

      <Dialog
        open={Boolean(handoverModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setHandoverModal(null);
        }}
        title="Confirm handover"
        description="Ask the customer for their 4-digit handover PIN, then enter it here."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => setHandoverModal(null)}
            >
              Cancel
            </Button>
            <Button loading={act.isPending} loadingLabel="Confirming…" onClick={confirmHandover}>
              Confirm handover
            </Button>
          </>
        }
      >
        <Field label="Handover PIN" required error={handoverModal?.error ?? undefined}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={handoverModal?.pin ?? ""}
            onChange={(e) =>
              setHandoverModal((current) =>
                current
                  ? { ...current, pin: e.target.value.replace(/\D/g, "").slice(0, 4), error: null }
                  : current,
              )
            }
            placeholder="4-digit PIN"
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(disputeModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setDisputeModal(null);
        }}
        title="Raise deposit dispute"
        description="Explain the issue. Leave consume blank (or 0) to dispute without taking money from the deposit."
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={() => setDisputeModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel="Submitting…"
              onClick={confirmDispute}
            >
              Raise dispute
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Reason" required error={disputeModal?.error ?? undefined}>
            <Textarea
              value={disputeModal?.reason ?? ""}
              onChange={(e) =>
                setDisputeModal((current) =>
                  current ? { ...current, reason: e.target.value, error: null } : current,
                )
              }
              placeholder="e.g. Scratched housing, missing bit set"
              rows={3}
            />
          </Field>
          <Field
            label="Amount to consume from deposit"
            description="Rupees. Leave blank for none (0). Blank never means full deposit."
            showOptional={false}
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                ₹
              </span>
              <Input
                className="pl-8"
                inputMode="decimal"
                value={disputeModal?.consumeRupees ?? ""}
                onChange={(e) =>
                  setDisputeModal((current) =>
                    current ? { ...current, consumeRupees: e.target.value, error: null } : current,
                  )
                }
                placeholder="0"
              />
            </div>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(cancelModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setCancelModal(null);
        }}
        title="Cancel booking"
        description="Cancels before handover. The customer gets a full refund and the asset dates are freed."
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={() => setCancelModal(null)}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel="Cancelling…"
              onClick={confirmCancel}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <Field label="Reason" showOptional error={cancelModal?.error ?? undefined}>
          <Textarea
            value={cancelModal?.reason ?? ""}
            onChange={(e) =>
              setCancelModal((current) =>
                current ? { ...current, reason: e.target.value, error: null } : current,
              )
            }
            placeholder="e.g. Equipment unavailable"
            rows={3}
          />
        </Field>
      </Dialog>
    </div>
  );
}
