import { redirect } from "next/navigation";

/**
 * My Rentals moved into Your Bookings, which now lists them beside every other booking. Old
 * links and bookmarks land there, filtered to rentals.
 */
export default function MyRentalsRedirect() {
  redirect("/activity?type=rentals");
}
