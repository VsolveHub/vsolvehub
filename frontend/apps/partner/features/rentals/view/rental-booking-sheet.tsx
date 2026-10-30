"use client";

import {
  Button,
  FactList,
  Readout,
  Sheet,
  Timeline,
  TimelineEvent,
  cn,
  formatDate,
  formatDateTime,
  formatMoney,
  useT,
} from "@vsolve/ui";

import {
  bookingActionLabel,
  canCancelBooking,
  canDisputeDeposit,
  partnerBookingAction,
  type BookingAction,
} from "@/features/rentals/booking-actions";
import type { PartnerRentalBooking, RentalBooking } from "@/features/rentals/queries";
import { DeliverySection } from "@/features/rentals/view/delivery-section";
import { InvoiceNotice } from "@/features/workspace/view/invoice-notice";

/**
 * Status words for a rental booking, and the badge tone each one earns.
 *
 * Moved out of `rentals-workspace.tsx` so the list and the detail sheet read
 * the same strings. A booking that is called "Handover" in the row and
 * "HANDOVER" in the panel beside it is two records to the person reconciling
 * them.
 */
export const RENTAL_BOOKING_STATUS_LABELS: Record<string, string> = {
  ALL: "rentals.bookingStatus.all",
  AWAITING_TRANSPORT_QUOTE: "rentals.bookingStatus.awaitingTransportQuote",
  PENDING_PAYMENT: "rentals.bookingStatus.pendingPayment",
  CONFIRMED: "rentals.bookingStatus.confirmed",
  HANDOVER: "rentals.bookingStatus.handover",
  RETURNED: "rentals.bookingStatus.returned",
  CANCELLED: "rentals.bookingStatus.cancelled",
  DISPUTED: "rentals.bookingStatus.disputed",
};

/** Values above are catalogue keys; an unmapped status renders as-is. */
export function rentalBookingStatusLabel(
  status: string | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (!status) return t("rentals.bookingStatus.unknown");
  const key = RENTAL_BOOKING_STATUS_LABELS[status.toUpperCase()];
  return key ? t(key) : status;
}

export function rentalBookingTone(
  status: string | undefined,
): "success" | "warning" | "neutral" | "danger" {
  const value = (status ?? "").toUpperCase();
  if (value === "CANCELLED" || value === "DISPUTED") return "danger";
  if (value === "PENDING_PAYMENT" || value === "AWAITING_TRANSPORT_QUOTE") return "warning";
  if (value === "CONFIRMED" || value === "HANDOVER") return "success";
  return "neutral";
}

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "rentals.depositStatus.requested",
  AUTHORIZED: "rentals.depositStatus.authorized",
  HELD: "rentals.depositStatus.held",
  RELEASED: "rentals.depositStatus.released",
  PARTIALLY_CONSUMED: "rentals.depositStatus.partiallyConsumed",
  FULLY_CONSUMED: "rentals.depositStatus.fullyConsumed",
};

function depositStatusLabel(status: string | undefined, t: ReturnType<typeof useT>): string {
  if (!status) return "—";
  const key = DEPOSIT_STATUS_LABELS[status.toUpperCase()];
  return key ? t(key) : status;
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

/**
 * One rental booking, open beside the list.
 *
 * The row behind this is a summary — asset, status, price, dates — and the panel
 * is where the booking is actually run. That is deliberate. The commands used to
 * sit on the row itself, which meant "Confirm handover" was offered next to a
 * record showing neither who the customer is nor what the deposit is doing.
 *
 * ## What is not here
 *
 * `handover_pin` is not rendered. The contract marks it "for the customer only",
 * and it is the customer who reads it out — a partner who could read it from
 * this panel could complete a handover without the customer present, which is
 * the entire point of the PIN.
 *
 * Customer identity is absent because the payload has none. The panel says so
 * rather than leaving a blank row.
 */
export function RentalBookingDetailSheet({
  booking,
  onOpenChange,
  onAction,
  isPending,
}: {
  booking: RentalBooking | null;
  onOpenChange: (open: boolean) => void;
  onAction: (bookingId: string, action: BookingAction) => void;
  isPending: boolean;
}) {
  const t = useT();
  const status = booking?.status ?? "";
  const primary = partnerBookingAction(status, booking?.deposit?.status);
  const showDispute = canDisputeDeposit(status, booking?.deposit?.status);
  const showCancel = canCancelBooking(status);
  const deposit = booking?.deposit;

  return (
    <Sheet
      side="end"
      open={booking !== null}
      onOpenChange={onOpenChange}
      title={booking?.asset?.title ?? t("rentals.sheet.titleFallback")}
      description={booking ? rentalBookingStatusLabel(booking.status, t) : undefined}
      footer={
        booking ? (
          <>
            <Button variant="ghost" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            {showCancel ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onAction(booking.id, "cancel")}
              >
                {bookingActionLabel("cancel", t)}
              </Button>
            ) : null}
            {showDispute ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onAction(booking.id, "dispute-deposit")}
              >
                {bookingActionLabel("dispute-deposit", t)}
              </Button>
            ) : null}
            {primary ? (
              <Button disabled={isPending} onClick={() => onAction(booking.id, primary)}>
                {bookingActionLabel(primary, t)}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {booking ? (
        <div className="flex flex-col gap-5 py-3">
          <SheetSection title={t("rentals.sheet.customer")}>
            <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3">
              <p className="text-sm font-medium text-text-muted">{t("rentals.sheet.notProvided")}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {t("rentals.sheet.customerNote")}
              </p>
            </div>
          </SheetSection>

          <SheetSection title={t("rentals.sheet.rental")}>
            <FactList
              items={[
                { label: t("rentals.sheet.from"), value: formatDate(`${booking.start_date}`) },
                { label: t("rentals.sheet.to"), value: formatDate(`${booking.end_date}`) },
                { label: t("rentals.sheet.quantity"), value: String(booking.quantity ?? 1) },
                {
                  label: t("rentals.sheet.collection"),
                  value:
                    booking.pickup_or_delivery_mode === "DELIVERY"
                      ? t("rentals.sheet.youDeliver")
                      : t("rentals.sheet.selfPickup"),
                },
              ]}
            />
          </SheetSection>

          {booking.pickup_or_delivery_mode === "DELIVERY" ? (
            <DeliverySection booking={booking as PartnerRentalBooking} />
          ) : null}

          <SheetSection title={t("rentals.sheet.amounts")}>
            <Readout
              label={t("rentals.sheet.rentalCharge")}
              value={formatMoney(booking.price_paise)}
              tone="active"
              size="sm"
              caption={t("rentals.sheet.rentalChargeCaption")}
            />
            <FactList
              items={[
                {
                  label: t("rentals.sheet.dailyRate"),
                  value: formatMoney(booking.asset.daily_rate_paise),
                },
                ...((booking.platform_fee_paise ?? 0) > 0
                  ? [
                      {
                        label: t("rentals.sheet.platformFee", { percent: booking.platform_fee_percent ?? 0 }),
                        value: `−${formatMoney(booking.platform_fee_paise ?? 0)}`,
                      },
                    ]
                  : []),
                ...((booking.transport_paise ?? 0) > 0
                  ? [
                      {
                        label: t("rentals.sheet.transport", { percent: booking.transport_fee_percent ?? 0 }),
                        value: formatMoney(booking.transport_paise ?? 0),
                      },
                    ]
                  : []),
                {
                  label: t("rentals.sheet.youReceive"),
                  value: formatMoney(
                    booking.price_paise -
                      (booking.platform_fee_paise ?? 0) +
                      (booking.transport_paise ?? 0) -
                      (booking.transport_fee_paise ?? 0),
                  ),
                },
              ]}
            />
            <InvoiceNotice />
          </SheetSection>

          <SheetSection title={t("rentals.sheet.refundableDeposit")}>
            {deposit ? (
              <>
                {status === "RETURNED" &&
                (deposit.status === "HELD" || deposit.status === "AUTHORIZED") ? (
                  <p className="text-sm text-text-secondary">
                    {t("rentals.sheet.depositReturnedHint")}
                  </p>
                ) : null}
                {status === "DISPUTED" &&
                (deposit.status === "HELD" || deposit.status === "AUTHORIZED") ? (
                  <p className="text-sm text-text-secondary">
                    {t("rentals.sheet.depositDisputedHint")}
                  </p>
                ) : null}
                <Readout
                  label={t("rentals.sheet.depositHeld")}
                  value={formatMoney(deposit.amount_paise)}
                  tone={deposit.status === "RELEASED" ? "success" : "neutral"}
                  size="sm"
                  caption={depositStatusLabel(deposit.status, t)}
                />
                {(deposit.consumed_paise ?? 0) > 0 ? (
                  <FactList
                    items={[
                      {
                        label: t("rentals.sheet.usedFromDeposit"),
                        value: formatMoney(deposit.consumed_paise ?? 0),
                      },
                    ]}
                  />
                ) : null}
                {deposit.provider_note ? (
                  <p className="text-xs text-text-secondary">{deposit.provider_note}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-secondary">
                {t("rentals.sheet.noDeposit")}
              </p>
            )}
          </SheetSection>

          {booking.notes ? (
            <SheetSection title={t("rentals.sheet.customerNotes")}>
              <p className="text-sm text-text">{booking.notes}</p>
            </SheetSection>
          ) : null}

          {booking.created_at ? (
            <SheetSection title={t("rentals.sheet.history")}>
              <Timeline label={t("rentals.sheet.bookingHistory")}>
                <TimelineEvent
                  title={t("rentals.sheet.bookingPlaced")}
                  timestamp={formatDateTime(booking.created_at)}
                />
              </Timeline>
            </SheetSection>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
