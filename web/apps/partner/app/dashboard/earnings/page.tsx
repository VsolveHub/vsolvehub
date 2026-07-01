import { redirect } from "next/navigation";

// Earnings live in the app's Earnings tab at /dashboard.
export default function EarningsRedirect() {
  redirect("/dashboard");
}
