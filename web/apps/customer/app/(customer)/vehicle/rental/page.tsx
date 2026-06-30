import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RentalBookingFlow } from "@/components/customer/vehicle/RentalBookingFlow";

export default async function RentalBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/rental");

  return (
    <div className="page-content">
      <h1 className="page-title">Vehicle rental</h1>
      <p className="page-subtitle">Rent a bike, car, luxury vehicle, or bus.</p>
      <RentalBookingFlow />
    </div>
  );
}
