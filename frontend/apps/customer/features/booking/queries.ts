"use client";

import { request, type Schemas } from "@vsolve/api-client";
import {
  EXPIRING_STATE,
  RECOVERY_POLL_INTERVAL,
  SESSION_STATE,
  VOLATILE_STATE,
  queryKeys,
} from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import {
  toCheckoutSessionView,
  toQuoteView,
  toWindowsView,
  type CheckoutSessionView,
  type QuoteView,
  type WindowsView,
} from "./adapters";
import { pendingQueryKeys, taskSignature } from "./contract-pending/keys";
import type {
  ProposedCheckoutSession,
  ProposedQuote,
  ProposedWindows,
} from "./contract-pending/types";
import type { TaskLine } from "./model/state";

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
 * here defaults: a window search served from cache is a false capacity claim,
 * which is why it is `VOLATILE_STATE` while addresses are `SESSION_STATE`.
 */

const PENDING_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Calls an endpoint that the contract does not publish yet.
 *
 * Throws on a non-2xx so an unreachable or failing endpoint surfaces as an error
 * state rather than as an empty result. Collapsing the two is the specific bug
 * the catalog work guarded against: a customer told there is no availability
 * when in fact the service was down.
 */
async function callPending<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const response = await fetch(`${PENDING_BASE}${path}`, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    credentials: "include",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
}) {
  const { postalCode, serviceVariantId } = input;

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
          },
        }),
      ),
    enabled: postalCode !== null,
    ...VOLATILE_STATE,
  });
}

export type ServiceabilityResult = Schemas["ServiceabilityResponse"];

/* -------------------------------------------------------------------------
   Proposed endpoints — contracts/proposals/0003-m1-booking-and-contract-drift.md
   ------------------------------------------------------------------------- */

export interface WindowsInput {
  serviceVariantId: string;
  addressId: string;
  taskLines: readonly TaskLine[];
}

export function useWindows(input: WindowsInput | null) {
  return useQuery<WindowsView>({
    queryKey: pendingQueryKeys.booking.windows({
      serviceVariantId: input?.serviceVariantId ?? "",
      addressId: input?.addressId ?? "",
      taskSignature: taskSignature(input?.taskLines ?? []),
    }),
    queryFn: async () => {
      const response = await callPending<ProposedWindows>("/api/v1/booking/windows/", {
        method: "POST",
        body: {
          service_variant_id: input!.serviceVariantId,
          address_id: input!.addressId,
          task_lines: input!.taskLines.map((line) => ({
            task_code: line.taskCode,
            quantity: line.quantity,
          })),
        },
      });
      return toWindowsView(response);
    },
    enabled: input !== null && input.taskLines.length > 0,
    ...VOLATILE_STATE,
  });
}

export function useQuote(cartId: string | null) {
  return useQuery<QuoteView>({
    queryKey: pendingQueryKeys.booking.quote(cartId ?? ""),
    queryFn: async () => {
      const response = await callPending<ProposedQuote>("/api/v1/quotes/", {
        method: "POST",
        body: { cart_id: cartId },
      });
      return toQuoteView(response);
    },
    enabled: cartId !== null,
    // A cached quote is a price the server no longer stands behind.
    ...EXPIRING_STATE,
  });
}

/**
 * The checkout session, polled while the Partner search runs.
 *
 * Polling here is transport recovery, not the mechanism: the search, the offer
 * expiry and the reservation all run server-side on Celery and server time. A
 * closed tab does not stop them, and reopening recovers the whole state from
 * this one read — which is why nothing about the search is kept in the reducer.
 */
export function useCheckoutSession(reference: string | null) {
  return useQuery<CheckoutSessionView>({
    queryKey: pendingQueryKeys.booking.checkoutSession(reference ?? ""),
    queryFn: async () => {
      const response = await callPending<ProposedCheckoutSession>(
        `/api/v1/checkout-sessions/${reference}/`,
        { method: "GET" },
      );
      return toCheckoutSessionView(response);
    },
    enabled: reference !== null,
    ...EXPIRING_STATE,
    // Stops once the session reaches a state that no longer changes on its own.
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      if (phase === "confirmed" || phase === "failed") return false;
      return RECOVERY_POLL_INTERVAL;
    },
  });
}
