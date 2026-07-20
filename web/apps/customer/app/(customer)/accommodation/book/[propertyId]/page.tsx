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
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Book your stay</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Complete the steps to confirm your accommodation.</p>
      <AccommodationBookingFlow property={property} initialMode={initialMode} />
    </div>
  );
}
