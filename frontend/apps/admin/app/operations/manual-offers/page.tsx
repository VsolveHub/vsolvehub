"use client";

import { OperationsShell } from "@/features/session/operations-shell";
import { ManualOfferForm } from "@/features/manual-offer/view/manual-offer-form";

/**
 * Manual dispatch.
 *
 * The override for work automatic dispatch cannot place. Both published targets
 * — a whole checkout and a single fulfilment unit — are one form, because the
 * operator's decision is which Partner, not which endpoint.
 */
export default function ManualOffersPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Offer work to a Partner</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Send a named Partner an offer for a booking automatic dispatch has not
        placed. They still choose whether to take it.
      </p>

      <div className="mt-6 max-w-3xl">
        <ManualOfferForm />
      </div>
    </OperationsShell>
  );
}
