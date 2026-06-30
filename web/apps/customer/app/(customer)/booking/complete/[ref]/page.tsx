import { notFound } from "next/navigation";
import { getBookingByRef } from "@/lib/bookings/queries";
import { getServerSession } from "@/lib/auth/session";
import { normalizeBookingStatus } from "@/lib/constants";
import { BookingCompletion } from "@/components/customer/booking/BookingCompletion";

type PageProps = {
  params: Promise<{ ref: string }>;
};

export default async function BookingCompletePage({ params }: PageProps) {
  const { ref } = await params;
  const session = await getServerSession();
  const booking = await getBookingByRef(ref, session?.id);
  if (!booking) notFound();

  const status = normalizeBookingStatus(booking.status);

  return (
    <div className="page-content" style={{ maxWidth: "32rem", margin: "0 auto" }}>
      <BookingCompletion
        bookingRef={booking.bookingRef}
        serviceName={booking.service.name}
        serviceId={booking.service.id}
        finalAmountPaise={booking.finalAmountPaise ?? booking.quotedAmount}
        slot={booking.slot}
        vendorName={booking.vendor?.name ?? null}
        existingRating={booking.rating}
      />
      {status !== "COMPLETED" && (
        <p className="text-sm text-muted" style={{ marginTop: "1rem" }}>
          Service is still in progress. You can rate once it is completed.
        </p>
      )}
    </div>
  );
}
