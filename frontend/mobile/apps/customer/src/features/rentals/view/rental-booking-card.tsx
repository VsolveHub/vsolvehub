import { Badge, Button, COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { Alert, Platform, View } from "react-native";

import {
  canCancelRentalBooking,
  formatPaise,
  getDepositStatusBadge,
  getRentalStatusBadge,
  type RentalBooking,
} from "../model";
import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { formatReadableDate } from "../pickup-time";
import { cancelRentalBooking } from "../queries";

export function RentalBookingCard({
  booking,
  onCancel,
  isCancelling,
}: {
  booking: RentalBooking;
  onCancel?: (bookingId: string) => void;
  isCancelling?: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const statusBadge = getRentalStatusBadge(booking.status);
  const deposit = booking.deposit;
  const depositBadge = getDepositStatusBadge(deposit?.status ?? "PENDING");
  const canCancel = canCancelRentalBooking(booking.status);
  const pendingPayment = (booking.status ?? "").toUpperCase() === "PENDING_PAYMENT";

  const paymentAttemptId = deposit?.payment_attempt_id ? String(deposit.payment_attempt_id) : null;

  const handoverPin =
    booking.handover_pin != null && String(booking.handover_pin).trim().length > 0
      ? String(booking.handover_pin).trim()
      : null;

  // W-054 / GAP-RNT-011: Inline cancellation mutation & error handling
  const cancelMutation = useMutation({
    mutationFn: () => cancelRentalBooking(booking.id),
    onSuccess: () => {
      setConfirmingCancel(false);
      void queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
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
      const result = await completeOrOpenRentalCheckout(paymentAttemptId, {
        businessName: "Vsolve Hub",
      });
      if (result.mode === "simulated") {
        Alert.alert("Success", "Rental fee and deposit recorded.");
      } else if (result.mode === "pending") {
        Alert.alert("Notice", "Payment is still preparing — try Pay Now again in a moment.");
      } else {
        Alert.alert("Payment Initiated", "Waiting for payment capture.");
      }
      void queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Could not open payment checkout.");
    } finally {
      setIsPaying(false);
    }
  };

  const isCancelInProgress = isCancelling || cancelMutation.isPending;

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Badge tone={statusBadge.tone} className="self-start">
              <Text className="text-[10px] font-bold">{statusBadge.label}</Text>
            </Badge>
            <Badge tone={depositBadge.tone} className="self-start">
              <Text className="text-[10px] font-bold">{depositBadge.label}</Text>
            </Badge>
          </View>
          <Text className="mt-1 text-base font-extrabold text-navy-900">
            {booking.asset?.title || "Rental Tool"}
          </Text>
          {booking.asset?.partner_name ? (
            <Text className="text-xs text-text-secondary">
              Offered by <Text className="font-semibold text-text">{booking.asset.partner_name}</Text>
            </Text>
          ) : null}
        </View>

        <View className="items-end rounded-xl bg-canvas p-2.5">
          <Text className="text-[10px] text-text-muted">Total Rental Fee</Text>
          <Text className="text-base font-black text-brand tabular-nums">
            {formatPaise((booking.price_paise ?? 0) + (booking.platform_fee_paise ?? 0))}
          </Text>
          {(booking.platform_fee_paise ?? 0) > 0 ? (
            <Text className="mt-0.5 text-[10px] text-text-secondary tabular-nums">
              Fee ({booking.platform_fee_percent ?? 0}%): {formatPaise(booking.platform_fee_paise ?? 0)}
            </Text>
          ) : null}
          <Text className="mt-0.5 text-[10px] text-text-secondary tabular-nums">
            Deposit: {formatPaise(deposit?.amount_paise ?? booking.deposit_paise ?? 0)}
          </Text>
        </View>
      </View>

      <View className="my-3 gap-1.5 rounded-xl bg-canvas p-3">
        <View className="flex-row items-center gap-2">
          <Calendar size={13} color={COLOR_TOKENS.textMuted} />
          <Text className="text-xs text-text-secondary">
            Rental Window:{" "}
            <Text className="font-bold text-navy-900">
              {formatReadableDate(booking.start_date)} → {formatReadableDate(booking.end_date)}
            </Text>
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Clock size={13} color={COLOR_TOKENS.textMuted} />
          <Text className="text-xs text-text-secondary">
            Handover: <Text className="font-bold text-navy-900">Self pickup</Text>
          </Text>
        </View>
      </View>

      {/* Handover PIN Display Banner (Web W-021, Dev-10) */}
      {handoverPin ? (
        <View className="my-2 rounded-xl border border-brand/30 bg-brand/10 p-3">
          <Text className="text-xs font-bold text-navy-900">Handover PIN</Text>
          <Text
            className="my-1 text-xl font-black text-brand tabular-nums tracking-widest"
            style={Platform.select({
              ios: { fontFamily: "Courier", letterSpacing: 6 },
              android: { fontFamily: "monospace", letterSpacing: 4, includeFontPadding: false },
              default: { fontFamily: "monospace", letterSpacing: 4 },
            })}
          >
            {handoverPin}
          </Text>
          <Text className="text-[11px] text-text-secondary">
            Share this 4-digit PIN with the equipment partner when you collect the tool.
          </Text>
        </View>
      ) : null}

      {/* Protocol Banner */}
      <View className="rounded-xl border border-line/60 bg-canvas p-3">
        <View className="flex-row items-start gap-2">
          <ShieldCheck size={16} color={COLOR_TOKENS.success} />
          <View className="flex-1">
            <Text className="text-xs font-bold text-navy-900">Handover & Protection Protocol:</Text>
            <Text className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
              Inspect equipment condition with the owner upon pickup. Return in good condition to
              trigger prompt security deposit release.
            </Text>
          </View>
        </View>
      </View>

      {/* Pay Now Button on PENDING_PAYMENT (Web W-022) */}
      {pendingPayment ? (
        <View className="mt-3 border-t border-line/60 pt-3">
          <Button
            size="sm"
            variant="primary"
            disabled={isPaying || !paymentAttemptId}
            onPress={() => void handlePayNow()}
            className="w-full"
          >
            <Text className="font-bold text-white">
              {isPaying ? "Opening checkout…" : "Pay Now"}
            </Text>
          </Button>
          {payError ? (
            <Text className="mt-1.5 text-center text-xs text-danger">{payError}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Two-step Cancellation with Inline Error (W-054 / GAP-RNT-011) */}
      {canCancel ? (
        <View className="mt-3 border-t border-line/60 pt-3">
          {confirmingCancel ? (
            <View className="gap-2">
              <Text className="text-xs text-text-secondary">
                Cancel before handover? Any captured payment will be refunded.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setConfirmingCancel(false);
                    cancelMutation.reset();
                  }}
                  disabled={isCancelInProgress}
                  className="flex-1"
                >
                  <Text className="text-xs font-semibold text-text">Keep booking</Text>
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={isCancelInProgress}
                  onPress={() => {
                    if (onCancel) {
                      onCancel(booking.id);
                    } else {
                      cancelMutation.mutate();
                    }
                  }}
                  className="flex-1"
                >
                  <Text className="text-xs font-bold text-white">
                    {isCancelInProgress ? "Cancelling…" : "Confirm cancel"}
                  </Text>
                </Button>
              </View>
              {cancelMutation.isError ? (
                <Text className="mt-1 text-xs text-danger">
                  {cancelMutation.error?.message || "Failed to cancel booking. Please try again."}
                </Text>
              ) : null}
            </View>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onPress={() => {
                cancelMutation.reset();
                setConfirmingCancel(true);
              }}
              className="self-start"
            >
              <Text className="text-xs font-medium text-text-secondary">Cancel booking</Text>
            </Button>
          )}
        </View>
      ) : null}
    </View>
  );
}
