import type { Metadata } from "next";

import { RateCardBoard } from "@/features/m2-rate-cards/view/rate-card-board";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate cards",
  robots: { index: false, follow: false },
};

export default function RateCardsPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Rate cards</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        The published day rate for workforce bookings, per city and skill. What is set here is what
        every customer on the instant path is charged, and a card is never edited — a correction is
        another card from a later date, and every booking already made keeps the number it was made
        at.
      </p>
      <div className="mt-6">
        <RateCardBoard />
      </div>
    </OperationsShell>
  );
}
