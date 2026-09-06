import { redirect } from "next/navigation";

export default function MyStayBookingsPage(): never {
  redirect("/bookings?category=stays");
}
