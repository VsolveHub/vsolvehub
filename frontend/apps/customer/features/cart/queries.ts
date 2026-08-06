"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The cart page's own server layer.
 *
 * The cart *commands* still live in `features/checkout/queries.ts` alongside the
 * plan and quote reads they invalidate — moving them would separate a mutation
 * from the cache rules that make it correct. What lives here is the one read no
 * other screen has: what else could go into this cart.
 */

export type ServiceCard = Schemas["ServiceCard"];

/**
 * Services one Partner could add to a visit this cart already has.
 *
 * Django selects these from active `SAME_PARTNER_SEQUENTIAL` compatibility rules
 * against what is already in the cart — the same rule the planner uses to merge
 * work into one unit. That is what entitles the section heading to promise "the
 * same professional, the same visit", and it is why nothing here is chosen,
 * ranked or filtered in the browser.
 *
 * An empty array is a real answer and the view renders nothing for it. There is
 * deliberately no fallback list: a cart with nothing compatible has nothing to
 * say here, and padding it with popular services would make the heading false.
 *
 * Keyed by cart version, so adding one of these suggestions re-asks the question
 * rather than leaving the added service sitting in its own strip.
 */
export function useCartSuggestions(cartVersion: number | null) {
  return useQuery({
    queryKey: queryKeys.booking.suggestions(cartVersion ?? 0),
    queryFn: async () =>
      (await request(() => getApiClient().POST("/api/v1/cart/suggestions/")))
        .suggestions,
    enabled: cartVersion !== null,
    ...SESSION_STATE,
  });
}
