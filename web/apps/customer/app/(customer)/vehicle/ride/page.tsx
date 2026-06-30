import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RideBookingFlow } from "@/components/customer/vehicle/RideBookingFlow";

export default async function RideBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/vehicle/ride");

  return <RideBookingFlow />;
}
