import type { Metadata } from "next";
import { Suspense } from "react";

import { PayoutsWorkspace } from "@/features/payouts/view/payouts-workspace";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

export default function PayoutsPage() {
  return (
    <Suspense fallback={null}>
      <PayoutsWorkspace />
    </Suspense>
  );
}
