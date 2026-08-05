"use client";

import { OperationsShell } from "@/features/session/operations-shell";
import { AssistedCheckoutForm } from "@/features/assisted-checkout/view/assisted-checkout-form";

/**
 * Assisted checkout.
 *
 * A single command with no queue in front of it, because there is nothing to
 * queue: the contract publishes no list of Customers waiting for help. The
 * operator arrives here from a call or a case with the two ids already in hand.
 */
export default function AssistedCheckoutsPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Assisted checkout</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Start a checkout for a Customer who cannot complete one themselves. Your
        account and the consent they gave are recorded against it.
      </p>

      <div className="mt-6 max-w-3xl">
        <AssistedCheckoutForm />
      </div>
    </OperationsShell>
  );
}
