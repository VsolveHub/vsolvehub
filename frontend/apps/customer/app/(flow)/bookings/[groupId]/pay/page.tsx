import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BookingPaymentPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(`/bookings/${groupId}`);
}
