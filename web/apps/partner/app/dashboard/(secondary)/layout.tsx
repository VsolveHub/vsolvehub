import { requirePartner } from "@/lib/auth";
import { DashboardChrome } from "@/components/dashboard/chrome";

export const metadata = { robots: { index: false } };

// Chromed shell (back-bar + logout) for the deep pages reached from the app's
// Profile tab: Documents, Skills, Settings, Support, Vehicle, Crew.
export default async function SecondaryLayout({ children }: { children: React.ReactNode }) {
  const partner = await requirePartner();
  return (
    <DashboardChrome name={partner.fullName ?? "Partner"} verified={partner.status === "ACTIVE"}>
      {children}
    </DashboardChrome>
  );
}
