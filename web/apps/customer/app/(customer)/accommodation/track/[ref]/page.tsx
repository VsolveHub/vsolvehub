import { AccommodationTracker } from "@/components/customer/accommodation/AccommodationTracker";

type PageProps = {
  params: Promise<{ ref: string }>;
};

export default async function AccommodationTrackPage({ params }: PageProps) {
  const { ref } = await params;

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Track stay booking</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Live updates on your accommodation booking.</p>
      <AccommodationTracker bookingRef={ref} />
    </div>
  );
}
