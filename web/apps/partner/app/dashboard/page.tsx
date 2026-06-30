import { redirect } from "next/navigation";

// The captain's home is now the mobile-first app at /live.
// Status gating (pending / action-required / draft) lives there too.
export default function DashboardHome() {
  redirect("/live");
}
