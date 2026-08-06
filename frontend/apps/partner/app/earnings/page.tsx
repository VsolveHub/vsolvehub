import type { Metadata } from "next";

import { EarningsPanel } from "@/features/earnings/view/earnings-panel";
import { PartnerShell } from "@/features/session/partner-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your earnings",
  robots: { index: false, follow: false },
};

export default function EarningsPage() {
  return (
    <PartnerShell>
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-text">Earnings Summary</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Track your payments and outstanding balances.
        </p>
        <div className="mt-5">
          <EarningsPanel />
        </div>
      </main>
    </PartnerShell>
  );
}
