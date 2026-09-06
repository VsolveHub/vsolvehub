"use client";

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import {
  RENTAL_WORKSPACE,
  STAY_WORKSPACE,
  resolveWorkspaces,
} from "@/features/workspace/registry";
import { WorkHome } from "@/features/work-stack/view/work-home";
import { RentalHome } from "@/features/rentals/view/rental-home";
import { StayHome } from "@/features/stays/view/stay-home";

export function PartnerDashboardHome() {
  const workspaceGrants = usePartnerWorkspaceGrants();
  const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
  const workspaceKeys = workspaces.map((w) => w.key);

  // If this partner has the Stay workspace, render the Stay Host Dashboard
  if (workspaceKeys.includes(STAY_WORKSPACE)) {
    return <StayHome />;
  }

  // If this partner has the Rental workspace, render the Rental Partner Dashboard
  if (workspaceKeys.includes(RENTAL_WORKSPACE)) {
    return <RentalHome />;
  }

  // Default to standard service technician work stack
  return <WorkHome />;
}
