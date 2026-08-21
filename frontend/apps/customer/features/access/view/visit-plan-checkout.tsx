"use client";

import { visitPlanPhase } from "@vsolve/query";
import { useState, type ReactNode } from "react";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";

import { toPlanCheckoutView, toVisitTrackerView } from "../adapters";
import {
  canSimulateAccessCheckout,
  useSimulateVisitPlanCapture,
  useStartVisitPlanCheckout,
  type VisitPlanState,
} from "../queries";
import { VisitPaymentDialog } from "./visit-payment-dialog";

export interface VisitPlanCheckoutControls {
  openPayment: () => void;
  chargeableLabel: string | null;
  isPending: boolean;
  error: unknown;
  canSimulatePendingCapture: boolean;
  simulatePendingCapture: () => void;
}

export interface VisitPlanCheckoutProps {
  requirementId: string;
  state: VisitPlanState | null;
  children: (controls: VisitPlanCheckoutControls) => ReactNode;
}

/**
 * The visit-plan payment flow, mounted where the Customer can already see the
 * held visit.
 *
 * The first button only opens the fee breakdown. Confirming that dialog then
 * passes through the existing profile-completion gate before the idempotent
 * checkout command runs. Keeping those steps together prevents the request
 * page and a separate checkout route from drifting into different flows.
 */
export function VisitPlanCheckout({
  requirementId,
  state,
  children,
}: VisitPlanCheckoutProps) {
  const profileGate = useProfileCompletionGate("payment");
  const checkout = useStartVisitPlanCheckout();
  const simulateCapture = useSimulateVisitPlanCapture();
  const [paying, setPaying] = useState(false);

  const phase = state === null ? null : visitPlanPhase(state);
  const view = state === null ? null : toPlanCheckoutView(state);
  const tracker = state === null ? null : toVisitTrackerView(state);
  const paymentAttemptId = state?.plan?.payment_attempt_id ?? null;
  const canSimulatePendingCapture =
    state?.plan?.simulated_capture_available === true && paymentAttemptId !== null;
  const isPending = checkout.isPending || simulateCapture.isPending;

  function markVisitPlanPaid(attemptId: string) {
    simulateCapture.mutate({ requirementId, paymentAttemptId: attemptId });
  }

  function startCheckout() {
    if (view === null || phase === null) return;
    checkout.mutate(
      {
        requirementId,
        planId: view.planId,
        isRetryAfterFailure: phase === "failed",
      },
      {
        onSuccess: (started) => {
          if (canSimulateAccessCheckout(started)) {
            markVisitPlanPaid(started.payment_attempt_id);
          }
        },
        onSettled: () => setPaying(false),
      },
    );
  }

  const controls: VisitPlanCheckoutControls = {
    openPayment: () => {
      if (view !== null && phase !== null) setPaying(true);
    },
    chargeableLabel: view?.chargeableLabel ?? null,
    isPending,
    error: checkout.error ?? simulateCapture.error,
    canSimulatePendingCapture,
    simulatePendingCapture: () => {
      if (paymentAttemptId !== null) {
        profileGate.run(() => markVisitPlanPaid(paymentAttemptId));
      }
    },
  };

  return (
    <>
      {children(controls)}
      {view !== null ? (
        <VisitPaymentDialog
          open={paying}
          onOpenChange={setPaying}
          planSize={view.planSize}
          chargeableLabel={view.chargeableLabel}
          creditLabel={view.creditLabel}
          rows={tracker?.rows ?? []}
          isPending={isPending}
          onConfirm={() => {
            setPaying(false);
            profileGate.run(startCheckout);
          }}
        />
      ) : null}
      {profileGate.dialog}
    </>
  );
}
