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

  const b = booking as any;
  const status = normalizeBookingStatus(b.status);

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4" style={{ maxWidth: "32rem", margin: "0 auto" }}>
      <BookingCompletion
        bookingRef={b.bookingRef}
        serviceName={b.service.name}
        serviceId={b.service.id}
        finalAmountPaise={b.finalAmountPaise ?? b.quotedAmount}
        slot={b.slot}
        vendorName={b.vendor?.name ?? null}
        existingRating={b.rating}
      />
      {status !== "COMPLETED" && (
        <p className="mt-4 text-sm text-gray-500">
          Service is still in progress. You can rate once it is completed.
        </p>
      )}
    </div>
  );
}
