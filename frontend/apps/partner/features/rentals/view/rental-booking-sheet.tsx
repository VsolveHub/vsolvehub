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
  ALL: "All",
  AWAITING_TRANSPORT_QUOTE: "Delivery request",
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  HANDOVER: "Handover",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

export function rentalBookingStatusLabel(status: string | undefined): string {
  if (!status) return "Unknown";
  return RENTAL_BOOKING_STATUS_LABELS[status.toUpperCase()] ?? status;
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
  REQUESTED: "Requested",
  AUTHORIZED: "Authorized",
  HELD: "Held",
  RELEASED: "Released",
  PARTIALLY_CONSUMED: "Partly used",
  FULLY_CONSUMED: "Fully used",
};

function depositStatusLabel(status: string | undefined): string {
  if (!status) return "—";
  return DEPOSIT_STATUS_LABELS[status.toUpperCase()] ?? status;
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
      title={booking?.asset?.title ?? "Booking"}
      description={booking ? rentalBookingStatusLabel(booking.status) : undefined}
      footer={
        booking ? (
          <>
            <Button variant="ghost" disabled={isPending} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {showCancel ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onAction(booking.id, "cancel")}
              >
                {bookingActionLabel("cancel")}
              </Button>
            ) : null}
            {showDispute ? (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => onAction(booking.id, "dispute-deposit")}
              >
                {bookingActionLabel("dispute-deposit")}
              </Button>
            ) : null}
            {primary ? (
              <Button disabled={isPending} onClick={() => onAction(booking.id, primary)}>
                {bookingActionLabel(primary)}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {booking ? (
        <div className="flex flex-col gap-5 py-3">
          <SheetSection title="Customer">
            <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3">
              <p className="text-sm font-medium text-text-muted">Not provided</p>
              <p className="mt-1 text-xs text-text-secondary">
                A rental booking does not carry the customer&rsquo;s name or number today. The
                handover PIN is issued to them, not to you.
              </p>
            </div>
          </SheetSection>

          <SheetSection title="Rental">
            <FactList
              items={[
                { label: "From", value: formatDate(`${booking.start_date}`) },
                { label: "To", value: formatDate(`${booking.end_date}`) },
                { label: "Quantity", value: String(booking.quantity ?? 1) },
                {
                  label: "Collection",
                  value: booking.pickup_or_delivery_mode === "DELIVERY" ? "You deliver" : "Self pickup",
                },
              ]}
            />
          </SheetSection>

          {booking.pickup_or_delivery_mode === "DELIVERY" ? (
            <DeliverySection booking={booking as PartnerRentalBooking} />
          ) : null}

          <SheetSection title="Amounts">
            <Readout
              label="Rental charge"
              value={formatMoney(booking.price_paise)}
              tone="active"
              size="sm"
              caption="What the customer was charged for the rental period"
            />
            <FactList
              items={[
                {
                  label: "Daily rate",
                  value: formatMoney(booking.asset.daily_rate_paise),
                },
                ...((booking.platform_fee_paise ?? 0) > 0
                  ? [
                      {
                        label: `Platform fee (${booking.platform_fee_percent ?? 0}%)`,
                        value: `−${formatMoney(booking.platform_fee_paise ?? 0)}`,
                      },
                    ]
                  : []),
                ...((booking.transport_paise ?? 0) > 0
                  ? [
                      {
                        label: `Transport (${booking.transport_fee_percent ?? 0}% commission)`,
                        value: formatMoney(booking.transport_paise ?? 0),
                      },
                    ]
                  : []),
                {
                  label: "You receive",
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

          <SheetSection title="Refundable deposit">
            {deposit ? (
              <>
                {status === "RETURNED" &&
                (deposit.status === "HELD" || deposit.status === "AUTHORIZED") ? (
                  <p className="text-sm text-text-secondary">
                    The item is back. Return the deposit, or raise a dispute if something is wrong.
                  </p>
                ) : null}
                {status === "DISPUTED" &&
                (deposit.status === "HELD" || deposit.status === "AUTHORIZED") ? (
                  <p className="text-sm text-text-secondary">
                    Operations is reviewing this dispute. The deposit stays held until they approve
                    the amount you asked to keep, or send it all back to the customer.
                  </p>
                ) : null}
                <Readout
                  label="Deposit held"
                  value={formatMoney(deposit.amount_paise)}
                  tone={deposit.status === "RELEASED" ? "success" : "neutral"}
                  size="sm"
                  caption={depositStatusLabel(deposit.status)}
                />
                {(deposit.consumed_paise ?? 0) > 0 ? (
                  <FactList
                    items={[
                      {
                        label: "Used from deposit",
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
                No deposit is recorded against this booking.
              </p>
            )}
          </SheetSection>

          {booking.notes ? (
            <SheetSection title="Customer notes">
              <p className="text-sm text-text">{booking.notes}</p>
            </SheetSection>
          ) : null}

          {booking.created_at ? (
            <SheetSection title="History">
              <Timeline label="Booking history">
                <TimelineEvent
                  title="Booking placed"
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
