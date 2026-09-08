"use client";

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import {
  LISTING_WORKSPACE,
  RENTAL_WORKSPACE,
  STAY_WORKSPACE,
  resolveWorkspaces,
} from "@/features/workspace/registry";
import { WorkHome } from "@/features/work-stack/view/work-home";
import { RentalHome } from "@/features/rentals/view/rental-home";
import { StayHome } from "@/features/stays/view/stay-home";
import PartnerListingsPage from "@/app/listings/page";

export function PartnerDashboardHome() {
  const workspaceGrants = usePartnerWorkspaceGrants();
  const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
  const workspaceKeys = workspaces.map((w) => w.key);

  // If this partner has the Job Listing workspace, render the Hiring Partner Dashboard
  if (workspaceKeys.includes(LISTING_WORKSPACE) && !workspaceKeys.includes(STAY_WORKSPACE) && !workspaceKeys.includes(RENTAL_WORKSPACE)) {
    return <PartnerListingsPage />;
  }

  // If this partner has the Stay workspace, render the Stay Host Dashboard
  if (workspaceKeys.includes(STAY_WORKSPACE)) {
    return <StayHome />;
  }

  // If this partner has the Rental workspace, render the Rental Partner Dashboard
  if (workspaceKeys.includes(RENTAL_WORKSPACE)) {
    return <RentalHome />;
  }

  // Fallback check for Listing workspace
  if (workspaceKeys.includes(LISTING_WORKSPACE)) {
    return <PartnerListingsPage />;
  }

  // Default to standard service technician work stack
  return <WorkHome />;
}
