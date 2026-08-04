import type { Metadata } from "next";

import { Receipt } from "@/features/payment/view/receipt";

/**
 * The receipt for one paid Booking Group.
 *
 * Dynamic and never indexed: this is one customer's order, allocations and
 * invoice. Reached through the group's `order_id` (contract 1.14.0), since an
 * Order is retrievable by id alone and has no list to search.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your receipt",
  robots: { index: false, follow: false },
};

export default async function BookingReceiptPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <Receipt groupId={groupId} />
    </main>
  );
}
