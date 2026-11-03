import { Metadata } from "next";

import { DashboardTabs } from "../../../../../features/dashboard/dashboard-tabs";
import { DashboardView } from "../../../../../features/dashboard/kind-dashboard";
import { DashboardPinStrip } from "../../../../../features/dashboard/pin-strip";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage(props: { params: Promise<{ kind: string }> }) {
  const params = await props.params;
  return (
    <>
      <DashboardTabs />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        <DashboardPinStrip />
      </div>
      <DashboardView kind={params.kind} />
    </>
  );
}
