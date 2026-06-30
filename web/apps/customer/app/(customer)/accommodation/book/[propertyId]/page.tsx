import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getPropertyById } from "@/lib/accommodation/queries";
import { AccommodationBookingFlow } from "@/components/customer/accommodation/AccommodationBookingFlow";

type PageProps = {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function AccommodationBookPage({ params, searchParams }: PageProps) {
  const session = await getServerSession();
  const { propertyId } = await params;
  const { mode } = await searchParams;

  if (!session) {
    redirect(
      `/booking/otp?redirect=${encodeURIComponent(`/accommodation/book/${propertyId}?mode=${mode ?? "move_in"}`)}`
    );
  }

  const property = await getPropertyById(propertyId);
  if (!property) redirect("/accommodation");

  const initialMode = mode === "visit" ? "visit" : "move_in";

  return (
    <div className="page-content">
      <h1 className="page-title">Book your stay</h1>
      <p className="page-subtitle">Complete the steps to confirm your accommodation.</p>
      <AccommodationBookingFlow property={property} initialMode={initialMode} />
    </div>
  );
}
