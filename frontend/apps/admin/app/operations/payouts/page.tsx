import type { Metadata } from "next";

import { PayoutConsole } from "@/features/payouts/view/payout-console";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payout runs",
  robots: { index: false, follow: false },
};

export default function PayoutsPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Payout runs</h1>
      <p className="mt-1 text-sm text-text-secondary">
        A run is proposed by one person and approved by another. Approving and paying both need a
        fresh verification code.
      </p>
      <div className="mt-6">
        <PayoutConsole />
      </div>
    </OperationsShell>
  );
}
