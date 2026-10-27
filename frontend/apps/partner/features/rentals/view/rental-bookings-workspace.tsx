"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, LoadMore, Textarea, formatDate, formatMoney, useT } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { BookingAction } from "@/features/rentals/booking-actions";
import {
  fetchPartnerRentalBookingsPage,
  partnerRentalBookingAction,
  uploadPartnerDisputePhoto,
} from "@/features/rentals/queries";
import { RentalBookingDetailSheet, rentalBookingStatusLabel, rentalBookingTone } from "@/features/rentals/view/rental-booking-sheet";
import { useRentalSections } from "@/features/rentals/view/rental-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

const BOOKING_STATUS_FILTERS = [
  "ALL",
  "AWAITING_TRANSPORT_QUOTE",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "HANDOVER",
  "RETURNED",
  "CANCELLED",
  "DISPUTED",
] as const;

type BookingStatusFilter = (typeof BOOKING_STATUS_FILTERS)[number];

type BookingActionBody = {
  pin?: string;
  reason?: string;
  consume_paise: number;
  photo_ids?: string[];
};

type HandoverModal = { bookingId: string; pin: string; error: string | null };
const MAX_DISPUTE_PHOTOS = 5;

type DisputeModal = {
  bookingId: string;
  reason: string;
  consumeRupees: string;
  photos: File[];
  error: string | null;
};
type CancelModal = { bookingId: string; reason: string; error: string | null };
type DepositChoice = { bookingId: string };

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
  const t = useT();
  const rentalSections = useRentalSections();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [handoverModal, setHandoverModal] = useState<HandoverModal | null>(null);
  const [disputeModal, setDisputeModal] = useState<DisputeModal | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModal | null>(null);
  const [depositChoice, setDepositChoice] = useState<DepositChoice | null>(null);

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

  // One page at a time; the status tab is filtered on the server.
  const bookings = usePagedList(["partner-rentals", "bookings", bookingStatusFilter], (cursor) =>
    fetchPartnerRentalBookingsPage(bookingStatusFilter === "ALL" ? undefined : bookingStatusFilter, cursor),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
  };

  const act = useMutation({
    mutationFn: async (input: {
      id: string;
      action: BookingAction;
      body?: BookingActionBody;
      photos?: File[];
    }) => {
      const photoIds: string[] = [];
      for (const file of input.photos ?? []) {
        const uploaded = await uploadPartnerDisputePhoto(file);
        photoIds.push(uploaded.upload_id);
      }
      return partnerRentalBookingAction(input.id, input.action, {
        ...input.body,
        consume_paise: input.body?.consume_paise ?? 0,
        ...(photoIds.length > 0 ? { photo_ids: photoIds } : {}),
      });
    },
    onSuccess: (_data, variables) => {
      setHandoverModal(null);
      setDisputeModal(null);
      setCancelModal(null);
      if (variables.action === "return") {
        setSelectedId(null);
        setDepositChoice({ bookingId: variables.id });
      } else {
        setDepositChoice(null);
      }
      invalidate();
    },
    onError: (err: unknown) => {
      const message = friendlyErrorMessage(err);
      setHandoverModal((current) => (current ? { ...current, error: message } : current));
      setDisputeModal((current) => (current ? { ...current, error: message } : current));
      setCancelModal((current) => (current ? { ...current, error: message } : current));
    },
  });

  const filteredBookings = bookings.items;

  // Looked up in the unfiltered list, so changing the filter while the panel is
  // open cannot blank the record the partner is reading.
  const selected = selectedId
    ? bookings.items.find((booking) => booking.id === selectedId) ?? null
    : null;

  function runBookingAction(bookingId: string, action: BookingAction) {
    if (action === "handover") {
      setSelectedId(null);
      setHandoverModal({ bookingId, pin: "", error: null });
      return;
    }
    if (action === "dispute-deposit") {
      setSelectedId(null);
      setDisputeModal({ bookingId, reason: "", consumeRupees: "", photos: [], error: null });
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
        error: t("rentals.bookings.errorPin"),
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
      setDisputeModal({ ...disputeModal, error: t("rentals.bookings.errorDisputeReason") });
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
          error: t("rentals.bookings.errorConsumeAmount"),
        });
        return;
      }
      consumePaise = parsed;
    }
    if (disputeModal.photos.length > MAX_DISPUTE_PHOTOS) {
      setDisputeModal({ ...disputeModal, error: t("rentals.bookings.errorMaxPhotos") });
      return;
    }
    act.mutate({
      id: disputeModal.bookingId,
      action: "dispute-deposit",
      body: { reason, consume_paise: consumePaise },
      photos: disputeModal.photos,
    });
  }

  function chooseDispute() {
    if (!depositChoice) return;
    const bookingId = depositChoice.bookingId;
    setDepositChoice(null);
    setSelectedId(null);
    setDisputeModal({ bookingId, reason: "", consumeRupees: "", photos: [], error: null });
  }

  function chooseReturnDeposit() {
    if (!depositChoice) return;
    act.mutate({
      id: depositChoice.bookingId,
      action: "release-deposit",
      body: { consume_paise: 0 },
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">{t("rentals.bookings.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t("rentals.bookings.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("rentals.bookings.intro")}
        </p>
      </div>

      <SectionNav label={t("rentals.sections.ariaLabel")} items={rentalSections} />

      <Card>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("rentals.bookings.filterAriaLabel")}>
          {BOOKING_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={bookingStatusFilter === status}
              onClick={() => setBookingStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                bookingStatusFilter === status
                  ? "bg-action text-white"
                  : "border border-line bg-surface text-text-secondary hover:text-navy-900"
              }`}
            >
              {rentalBookingStatusLabel(status, t)}
            </button>
          ))}
        </div>

        {bookings.isLoading ? <p className="mt-3 text-sm text-text-secondary">{t("common.loading")}</p> : null}
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
                ? t("rentals.bookings.emptyAllTitle")
                : t("rentals.bookings.emptyStatusTitle", {
                    status: rentalBookingStatusLabel(bookingStatusFilter, t).toLowerCase(),
                  })
            }
            description={
              bookingStatusFilter === "ALL"
                ? t("rentals.bookings.emptyAllDescription")
                : t("rentals.bookings.emptyStatusDescription")
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
                    {rentalBookingStatusLabel(booking.status, t)}
                  </Badge>
                </span>
                <span className="block text-sm text-text-secondary">
                  {formatMoney(booking.price_paise)} · {formatDate(booking.start_date)} –{" "}
                  {formatDate(booking.end_date)}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                  {t("rentals.bookings.viewBooking")}
                  <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <LoadMore
          className="mt-3"
          hasMore={bookings.hasMore}
          loading={bookings.loadingMore}
          onLoadMore={bookings.loadMore}
        />
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
        title={t("rentals.handover.title")}
        description={t("rentals.handover.description")}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => setHandoverModal(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button loading={act.isPending} loadingLabel={t("rentals.handover.confirming")} onClick={confirmHandover}>
              {t("rentals.handover.title")}
            </Button>
          </>
        }
      >
        <Field label={t("rentals.handover.pinLabel")} required error={handoverModal?.error ?? undefined}>
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
            placeholder={t("rentals.handover.pinPlaceholder")}
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(depositChoice)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setDepositChoice(null);
        }}
        title={t("rentals.depositChoice.title")}
        description={t("rentals.depositChoice.description")}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={act.isPending}
              onClick={chooseDispute}
            >
              {t("rentals.action.disputeDeposit")}
            </Button>
            <Button
              loading={act.isPending}
              loadingLabel={t("rentals.depositChoice.returning")}
              onClick={chooseReturnDeposit}
            >
              {t("rentals.action.releaseDeposit")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {t("rentals.depositChoice.body")}
        </p>
      </Dialog>

      <Dialog
        open={Boolean(disputeModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setDisputeModal(null);
        }}
        title={t("rentals.dispute.title")}
        description={t("rentals.dispute.description")}
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={() => setDisputeModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel={t("rentals.dispute.submitting")}
              onClick={confirmDispute}
            >
              {t("rentals.action.disputeDeposit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t("rentals.dispute.reason")} required error={disputeModal?.error ?? undefined}>
            <Textarea
              value={disputeModal?.reason ?? ""}
              onChange={(e) =>
                setDisputeModal((current) =>
                  current ? { ...current, reason: e.target.value, error: null } : current,
                )
              }
              placeholder={t("rentals.dispute.reasonPlaceholder")}
              rows={3}
            />
          </Field>
          <Field
            label={t("rentals.dispute.amountToKeep")}
            description={t("rentals.dispute.amountToKeepHint")}
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
          <Field
            label={t("rentals.dispute.photos")}
            description={t("rentals.dispute.photosHint")}
            showOptional
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-control file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm file:font-semibold file:text-navy-900"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setDisputeModal((current) => {
                  if (!current) return current;
                  const photos = [...current.photos, ...picked].slice(0, MAX_DISPUTE_PHOTOS);
                  const error =
                    current.photos.length + picked.length > MAX_DISPUTE_PHOTOS
                      ? t("rentals.bookings.errorMaxPhotos")
                      : null;
                  return { ...current, photos, error };
                });
                e.target.value = "";
              }}
            />
            {disputeModal && disputeModal.photos.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                {disputeModal.photos.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-text-link"
                      onClick={() =>
                        setDisputeModal((current) =>
                          current
                            ? {
                                ...current,
                                photos: current.photos.filter((_, photoIndex) => photoIndex !== index),
                                error: null,
                              }
                            : current,
                        )
                      }
                    >
                      {t("common.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(cancelModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setCancelModal(null);
        }}
        title={t("rentals.action.cancel")}
        description={t("rentals.cancel.description")}
        footer={
          <>
            <Button variant="ghost" disabled={act.isPending} onClick={() => setCancelModal(null)}>
              {t("rentals.cancel.keepBooking")}
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel={t("rentals.cancel.cancelling")}
              onClick={confirmCancel}
            >
              {t("rentals.action.cancel")}
            </Button>
          </>
        }
      >
        <Field label={t("rentals.dispute.reason")} showOptional error={cancelModal?.error ?? undefined}>
          <Textarea
            value={cancelModal?.reason ?? ""}
            onChange={(e) =>
              setCancelModal((current) =>
                current ? { ...current, reason: e.target.value, error: null } : current,
              )
            }
            placeholder={t("rentals.cancel.reasonPlaceholder")}
            rows={3}
          />
        </Field>
      </Dialog>
    </div>
  );
}
