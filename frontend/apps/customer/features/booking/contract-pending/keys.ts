/**
 * Query keys for the not-yet-published booking endpoints.
 *
 * These deliberately do not live in `@vsolve/query`'s `keys.ts`, whose header
 * states that keys exist only for endpoints published in the contract. They move
 * there when proposal 0003 lands. See ./README.md.
 *
 * The convention from `@vsolve/query` still applies and matters most here: every
 * input that changes the server's answer belongs in the key. A window search
 * that omitted the task lines would serve a one-task search's windows to a
 * three-task booking, which is a fabricated result.
 */

export interface WindowsKeyInput {
  serviceVariantId: string;
  addressId: string;
  /**
   * Serialized `taskCode×quantity` pairs, sorted.
   *
   * A string rather than the array because TanStack Query hashes keys
   * structurally: `[{a},{b}]` and `[{b},{a}]` are different keys for the same
   * basket, and would each cache a copy of the same answer.
   */
  taskSignature: string;
}

export const pendingQueryKeys = {
  booking: {
    all: ["booking-pending"] as const,

    windows: (input: WindowsKeyInput) =>
      [...pendingQueryKeys.booking.all, "windows", input] as const,

    /**
     * Keyed by cart rather than by the item's configuration: the server prices
     * the whole cart, and a key derived from local state would let a stale quote
     * survive a change the server has already repriced.
     */
    quote: (cartId: string) => [...pendingQueryKeys.booking.all, "quote", cartId] as const,

    /**
     * The checkout session, polled during `FINDING_PARTNER`.
     *
     * Keyed by reference so a resumed session after a refresh or a redirect loss
     * reads the same entry rather than starting a second search.
     */
    checkoutSession: (reference: string) =>
      [...pendingQueryKeys.booking.all, "checkout-session", reference] as const,

    cart: () => [...pendingQueryKeys.booking.all, "cart"] as const,
  },
} as const;

/** Builds the stable task signature used in the windows key. */
export function taskSignature(
  lines: readonly { taskCode: string; quantity: number }[],
): string {
  return [...lines]
    .filter((line) => line.quantity > 0)
    .sort((a, b) => a.taskCode.localeCompare(b.taskCode))
    .map((line) => `${line.taskCode}x${line.quantity}`)
    .join(",");
}
