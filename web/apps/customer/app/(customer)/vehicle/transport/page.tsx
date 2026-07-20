import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { TransportBookingFlow } from "@/components/customer/vehicle/TransportBookingFlow";

export default async function TransportBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/transport");

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Goods transport</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Move goods with Tata Ace, trucks, or house shifting.</p>
      <TransportBookingFlow />
    </div>
  );
}
