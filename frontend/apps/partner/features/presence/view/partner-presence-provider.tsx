"use client";

import { createContext, useContext, type ReactNode } from "react";

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

/** Keeps presence fresh app-wide so live booking delivery respects Go offline. */
export function PartnerPresenceProvider({ children }: { children: ReactNode }) {
  const value = usePartnerReceivingOffers();

  return (
    <PartnerPresenceContext.Provider value={value}>{children}</PartnerPresenceContext.Provider>
  );
}

export function usePartnerPresence(): PartnerPresenceContextValue {
  return useContext(PartnerPresenceContext);
}
