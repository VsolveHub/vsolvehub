import { notFound } from "next/navigation";
import { getAccommodationBookingByRef } from "@/lib/accommodation/queries";
import { getServerSession } from "@/lib/auth/session";
import { formatPrice, formatDate } from "@/lib/format";
import { ACCOMMODATION_STATUS_MESSAGES } from "@/lib/accommodation/constants";
import { BookingConfirmSlip } from "@/components/customer/booking/BookingConfirmSlip";

type PageProps = {
  searchParams: Promise<{ ref?: string }>;
};

export default async function AccommodationConfirmPage({ searchParams }: PageProps) {
  const { ref } = await searchParams;
  if (!ref) notFound();

  const session = await getServerSession();
  const booking = await getAccommodationBookingByRef(ref, session?.id);
  if (!booking) notFound();

  const status = booking.status as keyof typeof ACCOMMODATION_STATUS_MESSAGES;

  const rows = [
    { label: "Property", value: booking.property.title, highlight: true },
    { label: "Location", value: booking.property.location },
    { label: "Owner", value: `${booking.owner.name} · ★ ${booking.owner.rating.toFixed(1)}` },
    ...(booking.moveInDate
      ? [
          {
            label: "Move-in",
            value: `${formatDate(booking.moveInDate)}${booking.durationMonths ? ` · ${booking.durationMonths} months` : ""}`,
          },
        ]
      : []),
    ...(booking.visitDate ? [{ label: "Visit date", value: formatDate(booking.visitDate) }] : []),
    { label: "Booking type", value: booking.bookingType === "visit" ? "Schedule visit" : "Immediate move-in" },
    ...(booking.tokenAdvancePaise
      ? [{ label: "Token advance", value: formatPrice(booking.tokenAdvancePaise) }]
      : []),
    ...(booking.bookingFeePaise
      ? [{ label: "Booking fee", value: formatPrice(booking.bookingFeePaise) }]
      : []),
    ...(booking.firstMonthRentPaise
      ? [{ label: "First month rent", value: formatPrice(booking.firstMonthRentPaise) }]
      : []),
  ];

  return (
    <div className="page-content">
      <BookingConfirmSlip
        title="Stay booked!"
        subtitle="Your accommodation request has been sent to the property owner."
        bookingRef={booking.bookingRef}
        status={status}
        statusMessage={ACCOMMODATION_STATUS_MESSAGES[status]}
        rows={rows}
        totalLabel="Total paid"
        totalValue={formatPrice(booking.totalPaidPaise)}
        paymentMethod={booking.paymentMethod}
        paymentStatus={booking.paymentStatus}
        trackHref={`/accommodation/track/${booking.bookingRef}`}
        trackLabel="Track stay booking"
        secondaryHref="/accommodation"
        secondaryLabel="Browse more stays"
      />
    </div>
  );
}
