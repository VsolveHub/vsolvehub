// Ported from frontend/apps/partner/features/presence/view/partner-presence-provider.tsx
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { hydrateStoredSession } from "../model/stored-session";
import { usePartnerReceivingOffers } from "../model/use-partner-receiving-offers";
import type { PresenceStatus } from "../model/presence";

interface PartnerPresenceContextValue {
  readonly status: PresenceStatus;
  readonly isReceivingOffers: boolean;
}

const PartnerPresenceContext = createContext<PartnerPresenceContextValue>({
  status: "offline",
  isReceivingOffers: false,
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
