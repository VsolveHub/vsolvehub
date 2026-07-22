import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CheckoutClient } from "@/components/customer/checkout/CheckoutClient";

export default async function CheckoutPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/checkout");
  return <CheckoutClient />;
}
