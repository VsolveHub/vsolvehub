import type { Metadata } from "next";

import { CasesTabs } from "@/features/m2-cases/view/cases-tabs";
import { ReviewSignals } from "@/features/m2-cases/view/review-signals";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review signals",
  robots: { index: false, follow: false },
};

/**
 * Leakage, squatting and price-band indicators as review signals (`M2-FE-710`).
 *
 * A signal is something a person judges. `GAP-009` and `GAP-010` both say so in as many words —
 * "not automatic punishment — a review signal" — so nothing here delivers a verdict, and the two
 * signals the contract does not yet publish are named as absent rather than approximated.
 */
export default function ReviewSignalsPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Review signals</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Things worth a person&rsquo;s attention, with their evidence and their history. Never an
        accusation, and never an automatic consequence.
      </p>

      <CasesTabs />

      <div className="mt-6">
        <ReviewSignals />
      </div>
    </OperationsShell>
  );
}
