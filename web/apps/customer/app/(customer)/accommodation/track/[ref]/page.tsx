import { AccommodationTracker } from "@/components/customer/accommodation/AccommodationTracker";

type PageProps = {
  params: Promise<{ ref: string }>;
};

export default async function AccommodationTrackPage({ params }: PageProps) {
  const { ref } = await params;

  return (
    <div className="page-content">
      <h1 className="page-title">Track stay booking</h1>
      <p className="page-subtitle">Live updates on your accommodation booking.</p>
      <AccommodationTracker bookingRef={ref} />
    </div>
  );
}
