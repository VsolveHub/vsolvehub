import { redirect } from "next/navigation";

export default function CustomerRentalBookingsPage(): never {
  redirect("/bookings?category=rentals");
}
