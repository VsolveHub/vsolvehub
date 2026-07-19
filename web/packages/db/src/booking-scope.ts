// ─────────────────────────────────────────────────────────────────────────────
// DRAFT containment.
//
// Once the cart is "bookings whose status is DRAFT", every query that lists or
// dispatches bookings must exclude them, or carts leak into order history,
// partner job feeds, booking counts, and dispatch waves.
//
// Import these instead of hand-writing a status filter: one definition means one
// place to get it right, and a new cart-ish state only has to be added here.
// ─────────────────────────────────────────────────────────────────────────────

/** States that mean "this is a cart entry, not a real booking". */
export const CART_STATUSES = ["DRAFT"] as const;

/** Spread into any Prisma `where` that lists real (non-cart) bookings. */
export const ACTIVE_BOOKING_WHERE = {
  status: { notIn: [...CART_STATUSES] },
} as const;

const NON_DISPATCHABLE: readonly string[] = [
  ...CART_STATUSES,
  "COMPLETED",
  "CANCELLED",
  "NO_WORKER_FOUND",
];

/**
 * Guard at every dispatch entry point. This is a defensive assert rather than a
 * filter: reaching dispatch with a draft booking means money was never
 * authorized, so failing loudly beats quietly sending offers.
 */
export function isDispatchable(status: string): boolean {
  return !NON_DISPATCHABLE.includes(status);
}

/** True when a booking is still sitting in someone's cart. */
export function isCartStatus(status: string): boolean {
  return (CART_STATUSES as readonly string[]).includes(status);
}
