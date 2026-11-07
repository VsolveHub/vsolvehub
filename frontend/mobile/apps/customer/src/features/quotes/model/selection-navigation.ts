// Ported from frontend/apps/customer/features/quotes/model/selection-navigation.ts
import type { ProposalSelection } from "@vsolve/query/native";

import { engagementHref } from "@/lib/routes";

/** Destination returned by a completed choice; legacy pending rows have none yet. */
export function destinationAfterSelection(selection: ProposalSelection): string | null {
  return selection.engagement_id === null ? null : engagementHref(selection.engagement_id);
}
