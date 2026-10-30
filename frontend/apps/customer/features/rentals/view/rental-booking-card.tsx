"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, ShieldCheck } from "lucide-react";
import { describeError } from "@vsolve/query";
import { Badge, Button, formatDate, useToast } from "@vsolve/ui";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import {
  formatPaise,
  getDepositStatusBadge,
  getRentalStatusBadge,
  type RentalBooking,
} from "../model";
import { canCancelRentalBooking, cancelRentalBooking } from "../queries";

const BUSINESS_NAME = "Vsolve Hub";

interface RentalBookingCardProps {
  booking: RentalBooking;
}

export function RentalBookingCard({ booking }: RentalBookingCardProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const statusInfo = getRentalStatusBadge(booking.status);
  const depositInfo = getDepositStatusBadge(booking.deposit?.status ?? "PENDING");
  const cancellable = canCancelRentalBooking(booking.status);
  const pendingPayment = (booking.status ?? "").toUpperCase() === "PENDING_PAYMENT";
  const paymentAttemptId =
    booking.deposit != null &&
    "payment_attempt_id" in booking.deposit &&
    booking.deposit.payment_attempt_id != null
      ? String(booking.deposit.payment_attempt_id)
      : null;
  const handoverPin =
    booking.handover_pin != null && String(booking.handover_pin).trim().length > 0
      ? String(booking.handover_pin).trim()
      : null;

  const cancel = useMutation({
    mutationFn: () => cancelRentalBooking(booking.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-rentals"] });
    },
  });

  const handlePayNow = async () => {
    if (!paymentAttemptId) {
      setPayError("Payment is not ready yet. Refresh and try again shortly.");
      return;
    }
    setPayError(null);
    setIsPaying(true);
    try {
      const result = await completeOrOpenCheckout(paymentAttemptId, {
        businessName: BUSINESS_NAME,
        onAwaitingCapture: () =>
          toast.notify("Complete payment in Razorpay. Booking stays Pending until capture."),
      });
      if (result.mode === "simulated") {
        toast.notify("Payment recorded.");
      } else if (result.mode === "pending") {
        toast.notify("Payment is still preparing — try Pay Now again in a moment.");
      } else {
        toast.notify("Payment submitted. Waiting for capture.");
      }
      void qc.invalidateQueries({ queryKey: ["my-rentals"] });
    } catch (err) {
      setPayError(describeError(err, "mutation").message);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:shadow-raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusInfo.tone} className="font-bold text-xs">
              {statusInfo.label}
            </Badge>
            <Badge tone={depositInfo.tone} className="font-semibold text-xs">
              {depositInfo.label}
            </Badge>
          </div>

          <h3 className="pt-1 text-lg font-bold text-text">
            {booking.asset?.title ?? "Rental Equipment"}
          </h3>

          {booking.asset?.partner_name && (
            <p className="text-xs text-text-secondary">
              Equipment Partner:{" "}
              <span className="font-semibold text-text">{booking.asset.partner_name}</span>
            </p>
          )}
        </div>

        <div className="rounded-control border border-line/60 bg-surface-sunken p-3 text-right sm:min-w-40">
          <div className="text-xs text-text-secondary">
            {(booking.platform_fee_paise ?? 0) > 0 ? "Rental and platform fee" : "Total Rental Fee"}
          </div>
          <div className="text-lg font-extrabold text-action">
            {formatPaise((booking.price_paise ?? 0) + (booking.platform_fee_paise ?? 0))}
          </div>
          {(booking.platform_fee_paise ?? 0) > 0 ? (
            <div className="mt-0.5 text-[11px] text-text-secondary">
              Platform fee ({booking.platform_fee_percent ?? 0}%):{" "}
              {formatPaise(booking.platform_fee_paise ?? 0)}
            </div>
          ) : null}
          <div className="mt-0.5 text-[11px] text-text-secondary">
            Deposit: {formatPaise(booking.deposit?.amount_paise ?? 0)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line/70 pt-4 text-xs text-text-secondary sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 shrink-0 text-action" />
          <span>
            Rental Window:{" "}
            <strong className="font-bold text-text">{formatDate(booking.start_date)}</strong> to{" "}
            <strong className="font-bold text-text">{formatDate(booking.end_date)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-action" />
          <span>
            Handover: <strong className="font-bold text-text">Self pickup</strong>
          </span>
        </div>
      </div>

      {handoverPin ? (
        <div
          data-testid="handover-pin"
          className="mt-4 rounded-control border border-action/30 bg-action-surface p-3.5 text-xs"
        >
          <p className="font-bold text-text">Handover PIN</p>
          <p className="mt-1 font-mono text-base font-extrabold tracking-widest text-action">
            {handoverPin}
          </p>
          <p className="mt-1 text-[11px] text-text-secondary">
            Share this PIN with the partner when you collect the equipment.
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-control border border-line/50 bg-navy-950/5 p-3.5 text-xs text-text-secondary">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-action" />
          <div className="space-y-0.5">
            <span className="font-bold text-text">Handover & Protection Protocol:</span>
            <p className="text-[11px] leading-relaxed">
              Verify equipment condition with the partner upon receiving it. When your project is
              completed, return the tool in good working order to trigger immediate security deposit
              release.
            </p>
          </div>
        </div>
      </div>

      {pendingPayment ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
          <Button
            size="sm"
            loading={isPaying}
            loadingLabel="Opening payment…"
            disabled={isPaying || !paymentAttemptId}
            onClick={() => void handlePayNow()}
          >
            Pay Now
          </Button>
          {payError ? <p className="text-xs text-danger-text">{payError}</p> : null}
        </div>
      ) : null}

      {cancellable ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-text-secondary">
                Cancel before handover? Any captured payment will be refunded.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => setConfirming(false)}
              >
                Keep booking
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Confirm cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Cancel booking
            </Button>
          )}
          {cancel.isError ? (
            <p className="text-xs text-danger-text">
              {describeError(cancel.error, "mutation").message}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
