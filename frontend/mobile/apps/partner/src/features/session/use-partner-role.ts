// Ported from frontend/apps/partner/features/session/use-partner-role.ts
import { getApiClient } from "@vsolve/mobile-core";
import { hasRole, useCurrentSession } from "@vsolve/query/native";

import { PARTNER_ROLE } from "./chrome";

export interface PartnerRoleState {
  readonly isPartner: boolean;
  readonly isResolved: boolean;
}

export function usePartnerRole(): PartnerRoleState {
  const session = useCurrentSession(getApiClient());
  return {
    isPartner: hasRole(session.data?.user, PARTNER_ROLE),
    isResolved: !session.isPending,
  };
}
