import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { resolveWorkspaces, specialtyShellHome } from "@/features/workspace/registry";
import { WorkHome } from "@/features/work-stack/view/work-home";
import { RentalHome } from "@/features/rentals/view/rental-home";
import { PartnerStaysScreen } from "@/features/stays/view/partner-stays-screen";
import { ListingHome } from "@/features/listings/view/listing-home";
import { PartnerListingsScreen } from "@/features/listings/view/partner-listings-screen";

export default function HomeScreen() {
  const grants = usePartnerWorkspaceGrants();
  const resolved = resolveWorkspaces(grants.grants ?? []);
  const specialty = specialtyShellHome(resolved);

  if (specialty === "rentals") {
    return <RentalHome />;
  }
  if (specialty === "stays") {
    return <PartnerStaysScreen initialTab="properties" />;
  }
  if (specialty === "listings") {
    return <ListingHome />;
  }

  return <WorkHome />;
}
