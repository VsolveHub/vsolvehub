import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CartClient } from "@/components/customer/cart/CartClient";

export default async function CartPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/cart");
  return <CartClient />;
}
