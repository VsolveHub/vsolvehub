import { redirect } from "next/navigation";

import { bookingStatusHref, toBookingStatusTab } from "@/features/activity/model/booking-status";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<never> {
  const { status } = await searchParams;
  redirect(bookingStatusHref(toBookingStatusTab(status)));
}
