"use client";

import { useQueryClient } from "@tanstack/react-query";
import { describeError, queryKeys } from "@vsolve/query";
import { useCallback, useState } from "react";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";
import type { BookingGroup } from "@/features/bookings/queries";
import { handoffTarget, openProviderCheckout } from "./model/provider-handoff";
import {
  isSimulatedCaptureUnavailable,
  useCheckoutPayment,
  useSimulateCapture,
  useStartPayment,
  type PaymentAttempt,
} from "./queries";
import { waitForPaymentHandoff } from "./standalone-handoff";
import { useCheckoutLoyalty } from "./view/checkout-loyalty-options";

const BUSINESS_NAME = "Vsolve Hub";

export function useBookingPayment(group: BookingGroup) {
  const qc = useQueryClient();
  const profileGate = useProfileCompletionGate("payment");
  const checkoutId = group.checkout_id;

  const attemptQuery = useCheckoutPayment(checkoutId);
  const startPayment = useStartPayment();
  const simulateCapture = useSimulateCapture();

  const [isHandingOff, setIsHandingOff] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const payablePaise =
    group.units.reduce((sum, unit) => sum + (unit.total?.amount_paise ?? 0), 0);
  const loyalty = useCheckoutLoyalty(payablePaise);

  const refreshBooking = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.booking.group(group.id) });
    if (checkoutId) {
      void qc.invalidateQueries({ queryKey: queryKeys.payment.forCheckout(checkoutId) });
    }
  }, [qc, group.id, checkoutId]);

  async function handlePayAttempt(current: PaymentAttempt) {
    if (
      current.simulated_capture_available &&
      !isSimulatedCaptureUnavailable(simulateCapture.error)
    ) {
      setPayError(null);
      try {
        await simulateCapture.mutateAsync(current.id);
      } catch (err) {
        setPayError(describeError(err, "mutation").message);
      } finally {
        refreshBooking();
      }
      return;
    }

    setPayError(null);
    setIsHandingOff(true);
    try {
      const readyAttempt = await waitForPaymentHandoff(current.id);
      if (
        readyAttempt.simulated_capture_available &&
        !isSimulatedCaptureUnavailable(simulateCapture.error)
      ) {
        await simulateCapture.mutateAsync(readyAttempt.id);
        return;
      }
      const target = handoffTarget(readyAttempt);
      if (target === null) {
        setPayError("This payment is still preparing. Please try again in a moment.");
        return;
      }
      await openProviderCheckout(target, { businessName: BUSINESS_NAME });
    } catch (error) {
      setPayError(
        error instanceof Error
          ? error.message
          : "The payment provider could not be opened. Please try again.",
      );
    } finally {
      setIsHandingOff(false);
      refreshBooking();
    }
  }

  async function executePayment() {
    if (!checkoutId || group.checkout_version === null) {
      setPayError("Booking checkout is not ready. Please refresh.");
      return;
    }

    setPayError(null);
    try {
      let activeAttempt = attemptQuery.data ?? startPayment.data ?? null;
      if (activeAttempt?.status === "CAPTURED" || activeAttempt?.status === "AUTHORIZED") {
        refreshBooking();
        return;
      }

      if (
        !activeAttempt ||
        activeAttempt.status === "EXPIRED" ||
        activeAttempt.status === "FAILED"
      ) {
        activeAttempt = await startPayment.mutateAsync({
          checkoutId,
          expectedCheckoutVersion: group.checkout_version,
          groupId: group.id,
          walletAmountPaise: loyalty.walletAmountPaise,
          coinBurnAmount: loyalty.coinBurnAmount,
        });
      }
      await handlePayAttempt(activeAttempt);
    } catch (err) {
      setPayError(describeError(err, "mutation").message);
    }
  }

  const handlePay = () => {
    profileGate.run(() => void executePayment());
  };

  const isPaying =
    startPayment.isPending ||
    simulateCapture.isPending ||
    isHandingOff;

  return {
    handlePay,
    isPaying,
    payError,
    profileDialog: profileGate.dialog,
    loyalty,
  };
}
