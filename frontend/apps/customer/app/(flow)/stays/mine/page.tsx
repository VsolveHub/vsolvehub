import { redirect } from "next/navigation";

/**
 * My Stays (enquiries, visits and reservations) moved into Your Bookings, which now lists them beside every other booking. Old
 * links and bookmarks land there, filtered to stays.
 */
export default function MyStaysRedirect() {
  redirect("/activity?type=stays");
}
