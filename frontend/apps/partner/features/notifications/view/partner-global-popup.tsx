"use client";

import { hasRole, useCurrentSession, useSwitchRole } from "@vsolve/query";
import { useEffect } from "react";

import { getApiClient } from "@/lib/api/browser";
import { PARTNER_ROLE } from "@/features/session/partner-shell";

import { PartnerLiveDelivery } from "./live-booking-alert";
import { usePartnerPresence } from "@/features/presence/view/partner-presence-provider";

/**
 * Site-wide booking popup — mounted once at the app root.
 *
 * Previously lived inside `PartnerShell`, which meant a popup only existed on
 * routes that wrapped the shell, and only after every guard branch resolved.
 * Booking interrupts must appear on any authenticated Partner screen.
 */
export function PartnerGlobalPopup() {
  const session = useCurrentSession(getApiClient());
  const switchRole = useSwitchRole(getApiClient());
  const user = session.data?.user ?? null;
  const activeRole = session.data?.active_role ?? null;
  const hasPartner = user !== null && hasRole(user, PARTNER_ROLE);
  const shouldSelect =
    hasPartner && activeRole !== PARTNER_ROLE && switchRole.isIdle && !session.isPending;

  const { isReceivingOffers } = usePartnerPresence();

  useEffect(() => {
    if (shouldSelect) switchRole.mutate(PARTNER_ROLE);
  }, [shouldSelect, switchRole]);

  // Active, not merely held: Django refuses the stream (403) until the switch
  // above has landed, so opening it on `hasPartner` alone spent a refusal and
  // a reconnect after every sign-in.
  const partnerReady = !session.isPending && hasPartner && activeRole === PARTNER_ROLE;

  return (
    <PartnerLiveDelivery
      offersEnabled={partnerReady && isReceivingOffers}
      // Fixed-visit offers and enquiry invitations are dispatched by availability
      // and capability, not by the go-online toggle — a Partner invited on a
      // five-minute clock must be interrupted whether or not they pressed Go
      // Online for same-day work. Only the A1 stream stays presence-gated.
      invitationsEnabled={partnerReady}
    />
  );
}
