import { BookingTracker } from "@/components/customer/booking/BookingTracker";

type PageProps = {
  params: Promise<{ ref: string }>;
};

export default async function BookingTrackPage({ params }: PageProps) {
  const { ref } = await params;

  return <BookingTracker bookingRef={ref} />;
}
