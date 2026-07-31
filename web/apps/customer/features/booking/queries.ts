"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, SESSION_STATE, VOLATILE_STATE, queryKeys } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import {
  toAvailabilityView,
  toPreCheckView,
  toProviderOptions,
  toQuoteView,
  type AvailabilityView,
  type PreCheckView,
  type ProviderOptionView,
  type QuoteView,
} from "./adapters";
import { pendingQueryKeys } from "./contract-pending/keys";
import type {
  ProposedAvailability,
  ProposedEligiblePartners,
  ProposedInstantPreCheck,
  ProposedQuote,
} from "./contract-pending/types";

/**
 * The workspace's server reads.
 *
 * Two kinds of query live here, and the difference is deliberate rather than
 * accidental:
 *
 * - Published endpoints go through the generated client, which type-checks the
 *   path and the response.
 * - Proposed endpoints go through raw `fetch`, because there is nothing
 *   generated to call. They are typed at the boundary against
 *   `contract-pending/types` and immediately mapped to view models, so the
 *   guess never travels further than this file and the adapters.
 *
 * Every proposed query returns a view model, not a DTO. That is what keeps the
 * quarantine's blast radius to two directories.
 *
 * Freshness tiers come from `@vsolve/query` and are chosen per query. Nothing
 * here defaults: an availability search served from cache is a false capacity
 * claim, which is why it is `VOLATILE_STATE` while addresses are `SESSION_STATE`.
 */

const PENDING_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Calls an endpoint that the contract does not publish yet.
 *
 * Throws on a non-2xx so an unreachable or failing endpoint surfaces as an error
 * state rather than as an empty result. Collapsing the two is the specific bug
 * B2 guarded against in the catalog: a customer told there is no availability
 * when in fact the service was down.
 */
async function postPending<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${PENDING_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------
   Published endpoints
   ------------------------------------------------------------------------- */

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/addresses/")),
    enabled,
    ...SESSION_STATE,
  });
}

export function useServiceability(input: {
  postalCode: string | null;
  serviceVariantId: string | null;
  durationMinutes: number | null;
}) {
  const { postalCode, serviceVariantId, durationMinutes } = input;

  return useQuery({
    queryKey: queryKeys.locations.serviceability({
      postalCode: postalCode ?? "",
      serviceVariantId: serviceVariantId ?? undefined,
    }),
    queryFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/serviceability/check/", {
          body: {
            postal_code: postalCode as string,
            ...(serviceVariantId ? { service_variant_id: serviceVariantId } : {}),
            ...(durationMinutes ? { duration_minutes: durationMinutes } : {}),
          },
        }),
      ),
    enabled: postalCode !== null,
    ...VOLATILE_STATE,
  });
}

export type ServiceabilityResult = Schemas["ServiceabilityResponse"];

/* -------------------------------------------------------------------------
   Proposed endpoints — see contracts/proposals/0002-booking-workspace.md
   ------------------------------------------------------------------------- */

export interface AvailabilityInput {
  serviceVariantId: string;
  addressId: string;
  durationMinutes: number;
}

export function useAvailability(input: AvailabilityInput | null) {
  return useQuery<AvailabilityView>({
    queryKey: pendingQueryKeys.booking.availability(
      input ?? { serviceVariantId: "", addressId: "", durationMinutes: 0 },
    ),
    queryFn: async () => {
      const response = await postPending<ProposedAvailability>(
        "/api/v1/booking/availability/",
        {
          service_variant_id: input!.serviceVariantId,
          address_id: input!.addressId,
          duration_minutes: input!.durationMinutes,
        },
      );
      return toAvailabilityView(response);
    },
    enabled: input !== null,
    ...VOLATILE_STATE,
  });
}

export function useEligiblePartners(input: (AvailabilityInput & { slotId: string }) | null) {
  return useQuery<ProviderOptionView[]>({
    queryKey: pendingQueryKeys.booking.eligiblePartners(
      input ?? { serviceVariantId: "", addressId: "", durationMinutes: 0, slotId: "" },
    ),
    queryFn: async () => {
      const response = await postPending<ProposedEligiblePartners>(
        "/api/v1/booking/eligible-partners/",
        {
          service_variant_id: input!.serviceVariantId,
          address_id: input!.addressId,
          duration_minutes: input!.durationMinutes,
          slot_id: input!.slotId,
        },
      );
      return toProviderOptions(response);
    },
    enabled: input !== null,
    ...VOLATILE_STATE,
  });
}

export function useInstantPreCheck(input: AvailabilityInput | null) {
  return useQuery<PreCheckView>({
    queryKey: pendingQueryKeys.booking.instantPreCheck(
      input ?? { serviceVariantId: "", addressId: "", durationMinutes: 0 },
    ),
    queryFn: async () => {
      const response = await postPending<ProposedInstantPreCheck>(
        "/api/v1/booking/instant/pre-check/",
        {
          service_variant_id: input!.serviceVariantId,
          address_id: input!.addressId,
          duration_minutes: input!.durationMinutes,
        },
      );
      return toPreCheckView(response);
    },
    enabled: input !== null,
    // The pre-check reserves nothing and goes stale immediately — doc 11 §2.2
    // point 8 says ranking is re-run at assignment and this is never trusted as
    // still valid, so it must not be served from cache.
    ...EXPIRING_STATE,
  });
}

export function useQuote(cartId: string | null) {
  return useQuery<QuoteView>({
    queryKey: pendingQueryKeys.booking.quote(cartId ?? ""),
    queryFn: async () => {
      const response = await postPending<ProposedQuote>("/api/v1/booking/quote/", {
        cart_id: cartId,
      });
      return toQuoteView(response);
    },
    enabled: cartId !== null,
    // A cached quote is a price the server no longer stands behind.
    ...EXPIRING_STATE,
  });
}
