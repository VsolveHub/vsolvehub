import type { Metadata } from "next";

import { CasesTabs } from "@/features/m2-cases/view/cases-tabs";
import { MoneyConsole } from "@/features/m2-cases/view/money-console";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Refunds and holds",
  robots: { index: false, follow: false },
};

/**
 * Refund and payout states, read from the ledger-backed APIs (`M2-FE-708`).
 *
 * Not a second refund path. `POST /operations/requests/{id}/refund-review/` records a decision
 * and moves no money on purpose — refunds execute through the product that owns them, and an
 * Operations screen offering an amount field would be a second refund path with none of the
 * first's reconciliation. What is here is what the business is carrying, what is frozen behind an
 * open claim, and the one write 1.32.0 does publish: recording that a bank pulled a charge back.
 */
export default function CaseMoneyPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Refunds and holds</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Every figure here is the server&rsquo;s. Nothing on this screen is computed from anything
        else on it — a refund total a console derives is a total that can disagree with a
        statement, and that disagreement is what a dispute is made of.
      </p>

      <CasesTabs />

      <div className="mt-6">
        <MoneyConsole />
      </div>
    </OperationsShell>
  );
}
