import type { Metadata } from "next";

import { CaseConsole } from "@/features/cases/view/case-console";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cases",
  robots: { index: false, follow: false },
};

export default function CasesPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Cases</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Assignment, lateness, quality, safety, payment and payout cases. A case closes by naming
        what happened, not because somebody was contacted.
      </p>
      <div className="mt-6">
        <CaseConsole />
      </div>
    </OperationsShell>
  );
}
