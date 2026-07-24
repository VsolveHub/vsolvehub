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

  const b = booking as any;
  const status = normalizeBookingStatus(b.status);

  const scheduleLabel =
    b.scheduleType === "instant"
      ? "Instant booking"
      : `${formatDate(b.slot)} · ${new Date(b.slot).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

  const rows = [
    { label: "Service", value: b.service.name, highlight: true },
    ...(b.issueDescription
      ? [{ label: "Description", value: b.issueDescription }]
      : []),
    ...(parseMediaUrls(b.mediaUrls).length > 0
      ? [{ label: "Attachments", value: `${parseMediaUrls(b.mediaUrls).length} file(s)` }]
      : []),
    { label: "Schedule", value: scheduleLabel },
    { label: "Address", value: b.address.fullAddress },
    ...(b.vendor
      ? [{ label: "Professional", value: `${b.vendor.name} · ★ ${b.vendor.rating.toFixed(1)}` }]
      : []),
  ];

  const details = b.archetypeDetails ? JSON.parse(b.archetypeDetails) : {};
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
