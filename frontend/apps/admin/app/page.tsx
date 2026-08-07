import type { Metadata } from "next";

import { DashboardView } from "@/features/dashboard/dashboard-view";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default function OperationsHomePage() {
  return (
    <OperationsShell>
      <DashboardView />
    </OperationsShell>
  );
}
