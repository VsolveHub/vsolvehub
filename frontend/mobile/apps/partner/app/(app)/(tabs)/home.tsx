import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { resolveWorkspaces, specialtyShellHome } from "@/features/workspace/registry";
import { WorkHome } from "@/features/work-stack/view/work-home";
import { PartnerRentalsScreen } from "@/features/rentals/view/partner-rentals-screen";
import { PartnerStaysScreen } from "@/features/stays/view/partner-stays-screen";
import { PartnerListingsScreen } from "@/features/listings/view/partner-listings-screen";

export default function HomeScreen() {
  const grants = usePartnerWorkspaceGrants();
  const resolved = resolveWorkspaces(grants.grants ?? []);
  const specialty = specialtyShellHome(resolved);

  if (specialty === "rentals") {
    return <PartnerRentalsScreen initialTab="ads" />;
  }
  if (specialty === "stays") {
    return <PartnerStaysScreen initialTab="properties" />;
  }
  if (specialty === "listings") {
    return <PartnerListingsScreen />;
  }

  return <WorkHome />;
}
