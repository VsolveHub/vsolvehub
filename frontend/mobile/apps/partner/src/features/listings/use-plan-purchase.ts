// Ported from frontend/apps/partner/features/listings/use-partner-listing-mutations.ts (`subscribe`)
import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";

import { purchaseSubscription } from "./queries";

export type PlanPurchaseOutcome = "active" | "submitted" | "preparing";

const MESSAGES: Record<PlanPurchaseOutcome, { title: string; body: string }> = {
  active: { title: "Plan active", body: "Your plan is active." },
  submitted: {
    title: "Payment submitted",
    body: "Your plan turns on once Razorpay confirms the payment.",
  },
  preparing: {
    title: "Payment preparing",
    body: "Payment is still preparing. Try again in a moment.",
  },
};

/**
 * Buy a listing plan the way the web does: create the purchase, open Razorpay when it costs
 * money, and say what is true afterwards. A plan is active only once Razorpay confirms the
 * capture, so a closed checkout is never reported as an upgrade.
 *
 * `beforeCheckout` runs before Razorpay opens. Screens close their plan sheet there: iOS cannot
 * show the checkout over another modal.
 */
export function usePlanPurchase(options: { beforeCheckout: () => void; onSettled: () => void }) {
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  return useMutation({
    mutationFn: async (planId: string): Promise<PlanPurchaseOutcome> => {
      const subscription = await purchaseSubscription(planId);
      if (!subscription.payment_attempt_id) return "active";
      options.beforeCheckout();
      const result = await completeOrOpenCheckout(String(subscription.payment_attempt_id));
      return result.mode === "pending" ? "preparing" : "submitted";
    },
    onSuccess: (outcome) => {
      Alert.alert(MESSAGES[outcome].title, MESSAGES[outcome].body);
    },
    onError: (error: unknown) => {
      Alert.alert(
        "Subscription error",
        error instanceof Error && error.message ? error.message : "Failed to buy the plan.",
      );
    },
    onSettled: () => options.onSettled(),
  });
}
