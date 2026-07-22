import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { StoreCartClient } from "@/components/customer/store/StoreCartClient";

export const metadata = { title: "Store cart — V Solve Hub" };

export default async function StoreCartPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/store/cart");
  return <StoreCartClient />;
}
