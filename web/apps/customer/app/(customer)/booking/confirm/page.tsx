import { notFound } from "next/navigation";
import { getBookingByRef, parseMediaUrls } from "@/lib/bookings/queries";
import { getServerSession } from "@/lib/auth/session";
import { formatPrice, formatDate } from "@/lib/format";
import { normalizeBookingStatus, STATUS_MESSAGES } from "@/lib/constants";
import { BookingConfirmSlip } from "@/components/customer/booking/BookingConfirmSlip";

type PageProps = {
  searchParams: Promise<{ ref?: string }>;
};

export default async function BookingConfirmPage({ searchParams }: PageProps) {
  const { ref } = await searchParams;
  if (!ref) notFound();

  const session = await getServerSession();
  const booking = await getBookingByRef(ref, session?.id);
  if (!booking) notFound();

  const status = normalizeBookingStatus(booking.status);

  const scheduleLabel =
    booking.scheduleType === "instant"
      ? "Instant booking"
      : `${formatDate(booking.slot)} · ${new Date(booking.slot).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

  const rows = [
    { label: "Service", value: booking.service.name, highlight: true },
    ...(booking.issueDescription
      ? [{ label: "Description", value: booking.issueDescription }]
      : []),
    ...(parseMediaUrls(booking.mediaUrls).length > 0
      ? [{ label: "Attachments", value: `${parseMediaUrls(booking.mediaUrls).length} file(s)` }]
      : []),
    { label: "Schedule", value: scheduleLabel },
    { label: "Address", value: booking.address.fullAddress },
    ...(booking.vendor
      ? [{ label: "Professional", value: `${booking.vendor.name} · ★ ${booking.vendor.rating.toFixed(1)}` }]
      : []),
  ];

  const details = booking.archetypeDetails ? JSON.parse(booking.archetypeDetails) : {};
  const isTeam = details.bookingType === "team";

  return (
    <BookingConfirmSlip
      title="Booking confirmed!"
      subtitle="Your service request is in. We'll keep you updated every step of the way."
      bookingRef={booking.bookingRef}
      status={status}
      statusMessage={STATUS_MESSAGES[status]}
      rows={rows}
      totalLabel="Amount"
      totalValue={formatPrice(booking.quotedAmount)}
      paymentMethod={booking.paymentMethod}
      paymentStatus={booking.paymentStatus}
      trackHref={`/booking/track/${booking.bookingRef}`}
      secondaryHref="/"
      secondaryLabel="Back to home"
      isTeam={isTeam}
    />
  );
}
