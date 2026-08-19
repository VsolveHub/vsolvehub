import type { Metadata } from "next";

import { ReceiptDocument } from "@/features/engagement/view/receipt-document";

/**
 * The receipt for one engagement's access fee.
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
      <ReceiptDocument engagementId={engagementId} />
    </main>
  );
}
