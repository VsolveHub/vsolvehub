import type { Metadata } from "next";

import { Receipt } from "@/features/engagement/view/receipt";

/**
 * The receipt for one booking's fee.
 *
 * Dynamic and never indexed — it is somebody's payment record.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment receipt",
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  return (
    <main>
      <Receipt engagementId={engagementId} variant="document" />
    </main>
  );
}
