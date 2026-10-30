import type { Metadata } from "next";
import { AssistedCheckoutForm } from "@/features/assisted-checkout/view/assisted-checkout-form";

export const metadata: Metadata = { title: "Book for a customer" };

/**
 * Assisted checkout.
 *
 * A single command with no queue in front of it, because there is nothing to
 * queue: the contract publishes no list of Customers waiting for help. The
 * operator arrives here from a call or a case with the two ids already in hand.
 */
export default function AssistedCheckoutsPage() {
  return (
    <>

      <div className="mt-6 max-w-3xl">
        <AssistedCheckoutForm />
      </div>
    </>
  );
}
