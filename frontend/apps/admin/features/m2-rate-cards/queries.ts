"use client";

import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import { M2_OPS_FRESHNESS, STATIC_CONTENT, m2OpsKeys, type RateCardPublish } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The revision-4 rate card (`M2-FE-712`), contract 1.29.0 and 1.32.0.
 *
 * ## A card is loaded, never edited
 *
 * There is no update and no delete on this surface, and that is the design: a
 * booking made last week reconciles against the number it was made at, so
 * raising a rate is **one more row** with a later effective date. This module
 * therefore has exactly one mutation, and nothing here ever writes over a card
 * the cache is already holding.
 *
 * ## The idempotency key is the whole card
 *
 * Publishing the same card twice must replay rather than create a second row,
 * and publishing a *corrected* card must not replay the wrong one. Django's
 * stored `request_payload` for this command cannot be relied on to contain every
 * component, so the key is derived from the body the operator composed: same
 * numbers, same effective date, same key.
 *
 * ## Service areas are named; skills are not
 *
 * `RateCard` publishes `service_area` and `skill` as bare uuids, and the only
 * published options list that names a skill (`GET /partner/skills/`) omits the
 * id. So the city can be named by joining against `GET /service-areas/` and the
 * skill cannot be named at all. Logged in `frontend-execution-plan.md` §7; the
 * screen says so rather than pretending the uuid is a name.
 */

/**
 * Every published card, newest effective date first.
 *
 * `service_area` narrows to one city. It is part of the key because it changes
 * the server's answer — the same rule the M1 partner directory follows.
 */
export function useRateCards(serviceArea: string | null) {
  return useQuery({
    queryKey: m2OpsKeys.rateCards(serviceArea),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/rate-cards/", {
          params: { query: serviceArea ? { service_area: serviceArea } : {} },
        }),
      ),
    ...M2_OPS_FRESHNESS.rateCards,
  });
}

/**
 * The cities a card can be published for.
 *
 * `IsAuthenticated` only, so an Operations session may read it. Named "applicant
 * service areas" server-side because the Partner application is its other
 * caller; it is the platform's list of cities either way.
 */
export function useServiceAreas() {
  return useQuery({
    queryKey: ["service-areas"] as const,
    queryFn: () => request(() => getApiClient().GET("/api/v1/service-areas/", {})),
    ...STATIC_CONTENT,
  });
}

export function usePublishRateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RateCardPublish) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/rate-cards/", {
          params: {
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-rate-card-publish:${JSON.stringify(body)}`,
              ),
            },
          },
          body,
        }),
      ),
    // Invalidated rather than appended: the list is grouped and ordered by
    // effective date server-side, and splicing a row in here would be this
    // client re-implementing that ordering on the screen that prices every A3
    // booking.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...m2OpsKeys.all, "rate-cards"] });
    },
    retry: false,
  });
}
