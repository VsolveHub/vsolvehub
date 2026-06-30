import { requirePartner } from "@/lib/auth";
import { DashboardChrome } from "@/components/dashboard/chrome";

export const metadata = { robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const partner = await requirePartner();
  return (
    <DashboardChrome name={partner.fullName ?? "Partner"} verified={partner.status === "ACTIVE"}>
      {children}
    </DashboardChrome>
  );
}
