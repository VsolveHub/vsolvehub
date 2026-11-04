import { useLocalSearchParams } from "expo-router";

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { resolveWorkspaces, specialtyShellHome } from "@/features/workspace/registry";
import { WorkHome } from "@/features/work-stack/view/work-home";
import { RentalHome } from "@/features/rentals/view/rental-home";
import { StayHome } from "@/features/stays/view/stay-home";
import { ListingHome } from "@/features/listings/view/listing-home";

export default function HomeScreen() {
  const searchParams = useLocalSearchParams<{ specialty?: string }>();
  const grants = usePartnerWorkspaceGrants();
  const resolved = resolveWorkspaces(grants.grants ?? []);
  const specialty = specialtyShellHome(resolved);
  const effectiveSpecialty = searchParams.specialty || specialty;

  if (effectiveSpecialty === "rentals") {
    return <RentalHome />;
  }
  if (effectiveSpecialty === "stays") {
    return <StayHome />;
  }
  if (effectiveSpecialty === "listings") {
    return <ListingHome />;
  }

  return <WorkHome />;
}
