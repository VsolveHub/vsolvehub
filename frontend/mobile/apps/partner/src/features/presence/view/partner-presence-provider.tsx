// Ported from frontend/apps/partner/features/presence/view/partner-presence-provider.tsx
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { hydrateStoredSession } from "../model/stored-session";
import { usePartnerReceivingOffers } from "../model/use-partner-receiving-offers";
import type { PresenceStatus } from "../model/presence";

interface PartnerPresenceContextValue {
  readonly status: PresenceStatus;
  readonly isReceivingOffers: boolean;
  /** The session the server has confirmed, or `null`. The one copy every screen reads. */
  readonly sessionId: string | null;
}

const PartnerPresenceContext = createContext<PartnerPresenceContextValue>({
  status: "checking",
  isReceivingOffers: false,
  sessionId: null,
});

export function PartnerPresenceProvider({ children }: { children: ReactNode }) {
  const value = usePartnerReceivingOffers();
  useEffect(() => {
    hydrateStoredSession();
  }, []);
  return <PartnerPresenceContext.Provider value={value}>{children}</PartnerPresenceContext.Provider>;
}

export function usePartnerPresence(): PartnerPresenceContextValue {
  return useContext(PartnerPresenceContext);
}
