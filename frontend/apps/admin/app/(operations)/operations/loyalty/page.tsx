import type { Metadata } from "next";

import { LoyaltyBoard } from "@/features/loyalty/view/loyalty-board";

export const metadata: Metadata = {
  title: "Wallet and loyalty",
  robots: { index: false, follow: false },
};

export default function LoyaltyOperationsPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Wallet and loyalty</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Publish a new burn policy, top-up limit, or referral version. Existing referral
        promises stay on the version captured at signup.
      </p>
      <LoyaltyBoard />
    </>
  );
}
