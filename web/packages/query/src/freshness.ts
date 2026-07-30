/**
 * Cache-freshness tiers.
 *
 * Freshness is a correctness decision, not a performance knob. Caching a
 * catalog price for five minutes is fine; caching a capacity hold for five
 * minutes would show a partner or customer a commitment that no longer exists.
 *
 * Plan document 09 §15: catalog can have longer freshness; offer, hold and
 * active booking state is short-lived. Every query picks a tier explicitly —
 * there is no "default and hope".
 */

export interface FreshnessTier {
  /** How long data is served without a background refetch. */
  staleTime: number;
  /** How long unused data stays in memory. */
  gcTime: number;
  /** Whether returning to the tab should revalidate. */
  refetchOnWindowFocus: boolean;
  /** Whether regaining connectivity should revalidate. */
  refetchOnReconnect: boolean;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * Catalog, categories, service configuration, policy text.
 *
 * Changes only when Operations publishes an update, so a few minutes of
 * staleness is invisible to the customer and removes most navigation spinners.
 */
export const STATIC_CONTENT: FreshnessTier = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

/**
 * Session identity, saved addresses, payment-method presence.
 *
 * Rarely changes within a session, but a stale answer here can send a customer
 * down a login path they already completed, so it revalidates on focus.
 */
export const SESSION_STATE: FreshnessTier = {
  staleTime: 1 * MINUTE,
  gcTime: 10 * MINUTE,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Availability searches, quotes, serviceability.
 *
 * Always refetched. A cached availability result is a false capacity claim, and
 * a cached quote is a price the server no longer stands behind.
 */
export const VOLATILE_STATE: FreshnessTier = {
  staleTime: 0,
  gcTime: 30 * SECOND,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Capacity holds, instant dispatch state, live offers, active bookings, work
 * sessions.
 *
 * Expiry-bearing state. Never served stale, and short-lived in memory so a
 * returning tab cannot render an expired hold as live. Countdown rendering uses
 * the server clock rather than a refetch loop.
 */
export const EXPIRING_STATE: FreshnessTier = {
  staleTime: 0,
  gcTime: 10 * SECOND,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Bounded recovery polling interval, for use only where event delivery is
 * unavailable.
 *
 * Polling never drives dispatch, expiry or assignment — Celery owns those
 * (ADR-012). This exists so a screen can converge after a missed event, and it
 * is deliberately slow enough not to become a load source.
 */
export const RECOVERY_POLL_INTERVAL = 10 * SECOND;
