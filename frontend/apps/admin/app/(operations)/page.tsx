import type { Metadata } from "next";

import { AttentionStrip } from "@/features/dashboard/attention";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { ConsoleDirectory } from "@/features/dashboard/directory";

export const metadata: Metadata = {
  title: "Home",
};

/** Home: what is waiting outside the case queue, the case queue itself, then the map of the console. */
export default function OperationsHomePage() {
  return (
    <>
      <AttentionStrip />
      <DashboardView />
      <ConsoleDirectory />
    </>
  );
}
