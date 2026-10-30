import type { Metadata } from "next";
import { ManualOfferForm } from "@/features/manual-offer/view/manual-offer-form";

export const metadata: Metadata = { title: "Manual offers" };

/**
 * Manual dispatch.
 *
 * The override for work automatic dispatch cannot place. Both published targets
 * — a whole checkout and a single fulfilment unit — are one form, because the
 * operator's decision is which Partner, not which endpoint.
 */
export default function ManualOffersPage() {
  return (
    <>

      <div className="mt-6 max-w-3xl">
        <ManualOfferForm />
      </div>
    </>
  );
}
