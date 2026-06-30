import { VehicleTracker } from "@/components/customer/vehicle/VehicleTracker";

type PageProps = { params: Promise<{ ref: string }> };

export default async function VehicleTrackPage({ params }: PageProps) {
  const { ref } = await params;

  return <VehicleTracker bookingRef={ref} />;
}
