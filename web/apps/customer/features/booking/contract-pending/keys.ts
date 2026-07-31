/**
 * Query keys for the not-yet-published booking endpoints.
 *
 * These deliberately do not live in `@vsolve/query`'s `keys.ts`, whose header
 * states that keys exist only for endpoints published in the contract. They move
 * there when proposal 0002 lands. See ./README.md.
 *
 * The convention from `@vsolve/query` still applies and matters most here: every
 * input that changes the server's answer belongs in the key. Availability that
 * omitted duration would serve a 60-minute search's slots to a 120-minute
 * booking, which is a fabricated result.
 */

export interface AvailabilityKeyInput {
  serviceVariantId: string;
  addressId: string;
  durationMinutes: number;
}

export interface EligiblePartnersKeyInput extends AvailabilityKeyInput {
  slotId: string;
}

export const pendingQueryKeys = {
  booking: {
    all: ["booking-pending"] as const,

    availability: (input: AvailabilityKeyInput) =>
      [...pendingQueryKeys.booking.all, "availability", input] as const,

    eligiblePartners: (input: EligiblePartnersKeyInput) =>
      [...pendingQueryKeys.booking.all, "eligible-partners", input] as const,

    instantPreCheck: (input: AvailabilityKeyInput) =>
      [...pendingQueryKeys.booking.all, "instant-pre-check", input] as const,

    /**
     * Keyed by cart rather than by the item's configuration: the server prices
     * the whole cart, and a key derived from local state would let a stale quote
     * survive a change the server has already repriced.
     */
    quote: (cartId: string) => [...pendingQueryKeys.booking.all, "quote", cartId] as const,

    cart: () => [...pendingQueryKeys.booking.all, "cart"] as const,
  },
} as const;
