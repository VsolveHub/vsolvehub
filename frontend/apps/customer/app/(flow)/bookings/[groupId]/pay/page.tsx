import type { Metadata } from "next";

import { PaymentWorkspace } from "@/features/payment/view/payment-workspace";

/**
 * Payment for one Booking Group.
 *
 * A route under the group rather than a floating `/checkout`, because a payment
 * belongs to a booking that already exists — the professionals are held, the
 * price is fixed and the only open question is the money. Being addressable is
 * the point: contract 1.14.0 publishes the group's `checkout_id` and
 * `checkout_version` so this page can be reached after a reload, from a second
 * device, or from a notification, none of which the confirming tab could do.
 *
 * `force-dynamic` and `no-store`. This reads one customer's payment, and a
 * cached render of it — anywhere, at any layer — would be somebody else's money
 * on somebody else's screen.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pay for your booking",
  robots: { index: false, follow: false },
};

export default async function BookingPaymentPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <PaymentWorkspace groupId={groupId} />
    </main>
  );
}
