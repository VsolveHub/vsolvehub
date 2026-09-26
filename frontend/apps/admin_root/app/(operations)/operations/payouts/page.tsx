import type { Metadata } from "next";

import { PayoutConsole } from "@/features/payouts/view/payout-console";


export const metadata: Metadata = {
  title: "Payout runs",
  robots: { index: false, follow: false },
};

export default function PayoutsPage() {
  return (
    <>
      <div className="mt-6">
        <PayoutConsole />
      </div>
    </>
  );
}
