"use client";

import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import { M2_OPS_FRESHNESS, STATIC_CONTENT, m2OpsKeys, type RateCardPublish } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The revision-4 rate card (`M2-FE-712`, `M2-FE-713`), contracts 1.29.0 to 1.33.0.
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
 * ## Both halves of the key are named now
 *
 * `RateCard` publishes `service_area` and `skill` as bare uuids, so the board
 * joins both against their option lists. Until 1.33.0 only the city could be
 * resolved — `PartnerSkillOption` withheld `id` — and the publish form asked an
 * operator to paste a skill uuid they had no way to look up. That gap was logged
 * in `frontend-execution-plan.md` §7 and is now closed by `useSkillOptions`.
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
 * `M2-FE-713`. Every live card's crew-offer decline rate, **armed or not**.
 *
 * Published at 1.33.0 after the panel was first built against its absence. Not
 * filtered client-side and not narrowed by city: unarmed cards are returned on
 * purpose, because the most useful thing this endpoint can say on the day A3
 * supply fails is *nothing here is watching*, and a list that dropped them would
 * say the opposite by being short.
 *
 * Polled, unlike everything else in this module. It is an alarm — a stale one is
 * a supply failure nobody has been told about — and the interval is well inside
 * the published `window_hours` the rates are measured over.
 */
export function useDeclineAlarm() {
  return useQuery({
    queryKey: m2OpsKeys.declineAlarm(),
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/operations/rate-cards/decline-alarm/", {})),
    ...M2_OPS_FRESHNESS.declineAlarm,
    refetchInterval: 60_000,
  });
}

/**
 * The skills a card can be published against, **with their ids**.
 *
 * `PartnerSkillOption` gained `id` at 1.33.0, and the reason is this screen: the
 * publish form takes `skill_id` as a uuid, this was the only endpoint listing
 * skills, and withholding the id meant the form that decides what every A3
 * customer in a city is charged asked an operator to type a uuid they had no way
 * to look up. Paste the wrong one and the price is published against the wrong
 * trade, and it is priced into every booking until somebody notices.
 *
 * The same list the applicant-onboarding chooser reads, which is the point — one
 * source for what a skill is.
 */
export function useSkillOptions() {
  return useQuery({
    queryKey: ["partner-skill-options"] as const,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/skills/", {})),
    ...STATIC_CONTENT,
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
