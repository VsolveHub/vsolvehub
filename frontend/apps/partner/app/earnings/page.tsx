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
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-2xl font-bold text-text">Your earnings</h1>
        <div className="mt-6">
          <EarningsPanel />
        </div>
      </main>
    </PartnerShell>
  );
}
