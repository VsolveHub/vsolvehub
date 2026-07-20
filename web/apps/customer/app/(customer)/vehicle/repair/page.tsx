import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RepairBookingFlow } from "@/components/customer/vehicle/RepairBookingFlow";

export default async function RepairBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/repair");

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vehicle repair</h1>
      <p className="mt-1 mb-5 text-[15px] text-gray-500">Book a mechanic — at garage or doorstep.</p>
      <RepairBookingFlow />
    </div>
  );
}
