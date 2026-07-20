import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RentalBookingFlow } from "@/components/customer/vehicle/RentalBookingFlow";

export default async function RentalBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/rental");

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vehicle rental</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Rent a bike, car, luxury vehicle, or bus.</p>
      <RentalBookingFlow />
    </div>
  );
}
