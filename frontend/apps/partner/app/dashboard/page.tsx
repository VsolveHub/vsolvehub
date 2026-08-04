import type { Metadata } from "next";

import { DashboardHome } from "@/features/session/view/dashboard-home";

/**
 * Where signing in lands, and the only screen that shows a Partner their whole
 * account at once. Never cached and never indexed: every branch depends on the
 * signed-in Partner's own application.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your work",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <DashboardHome />;
}
