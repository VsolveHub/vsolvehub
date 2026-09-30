import { Metadata } from "next";
import { DashboardView } from "../../../../../features/dashboard/kind-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage(props: { params: Promise<{ kind: string }> }) {
  const params = await props.params;
  return <DashboardView kind={params.kind} />;
}
