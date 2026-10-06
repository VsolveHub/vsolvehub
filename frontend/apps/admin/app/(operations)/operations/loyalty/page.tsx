import type { Metadata } from "next";

import { LoyaltyWorkspace } from "@/features/loyalty/view/loyalty-workspace";

export const metadata: Metadata = {
  title: "Wallet and loyalty",
  robots: { index: false, follow: false },
};

export default function LoyaltyOperationsPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Wallet and loyalty</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Wallet limits, V Coins campaigns and the referral program. Changes apply without a
        deploy; referrals keep the terms that applied when the friend signed up.
      </p>
      <LoyaltyWorkspace />
    </>
  );
}
