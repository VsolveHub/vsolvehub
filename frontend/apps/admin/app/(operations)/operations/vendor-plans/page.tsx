import { redirect } from "next/navigation";

/**
 * Job plans moved to Jobs › Plans, next to the jobs they sell and their Money tab. Old links and
 * bookmarks land there.
 */
export default function VendorPlansOperationsPage() {
  redirect("/operations/listings?tab=plans");
}
