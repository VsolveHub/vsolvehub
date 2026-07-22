import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { StoreOrdersClient } from "@/components/customer/store/StoreOrdersClient";

export const metadata = { title: "My orders — V Solve Hub" };

export default async function StoreOrdersPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/store/orders");
  return <StoreOrdersClient />;
}
