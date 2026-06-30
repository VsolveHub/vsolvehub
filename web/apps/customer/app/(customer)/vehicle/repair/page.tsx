import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RepairBookingFlow } from "@/components/customer/vehicle/RepairBookingFlow";

export default async function RepairBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/repair");

  return (
    <div className="page-content">
      <h1 className="page-title">Vehicle repair</h1>
      <p className="page-subtitle">Book a mechanic — at garage or doorstep.</p>
      <RepairBookingFlow />
    </div>
  );
}
