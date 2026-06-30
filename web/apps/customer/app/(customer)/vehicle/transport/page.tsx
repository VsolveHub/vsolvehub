import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { TransportBookingFlow } from "@/components/customer/vehicle/TransportBookingFlow";

export default async function TransportBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/transport");

  return (
    <div className="page-content">
      <h1 className="page-title">Goods transport</h1>
      <p className="page-subtitle">Move goods with Tata Ace, trucks, or house shifting.</p>
      <TransportBookingFlow />
    </div>
  );
}
