"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE, queryKeys } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The workspace's server reads.
 *
 * Every request in this file goes through the generated client, so the path and
 * the response shape both come from `contracts/openapi/v1.yaml`. There is no
 * second mechanism, and that is the point.
 *
 * ## Why the proposed-endpoint queries are gone
 *
 * This module used to hold a `callPending` raw `fetch` for arrival windows, the
 * quote and the checkout session, typed against `contract-pending/`. The type
 * quarantine was real, but it protected the wrong thing: it stopped a guessed
 * *shape* spreading through the codebase while still sending a guessed *request*
 * from a production bundle. A path Django has never published cannot answer, so
 * every one of those calls was a request that could only fail — and a failure the
 * customer would read as "no availability" rather than "not built yet".
 *
 * The window/quote/checkout adapters, view models and fixtures are kept: they are
 * design and test inputs, and they are what the integration will map onto when
 * BE-06/BE-07 publish the real operations. Nothing production-facing calls them.
 * `contract-pending/boundary.test.ts` fails the build if an unpublished path
 * reappears in production source.
 *
 * Freshness tiers come from `@vsolve/query` and are chosen per query. Nothing
 * here defaults: a serviceability answer served from cache is a false claim about
 * coverage, which is why it is `VOLATILE_STATE` while addresses are
 * `SESSION_STATE` (in `features/addresses/queries.ts`, which now owns them).
 */

/* -------------------------------------------------------------------------
   Published endpoints
   ------------------------------------------------------------------------- */

/**
 * Saved addresses live in `features/addresses/queries.ts`.
 *
 * They were defined here until the account address book needed the same four
 * operations. Re-exported rather than copied: a second implementation would be a
 * second cache-writing policy for one resource, and checkout and the account
 * screen would drift on what happens after a delete. Import site unchanged for
 * every existing caller.
 */
export {
  isGeocoded,
  formatAddressLine,
  useAddresses,
  useCreateAddress,
  useUpdateAddress,
  useArchiveAddress,
  useReverseGeocode,
} from "@/features/addresses/queries";
export type {
  Address,
  AddressInput,
  AddressPatch,
  ResolvedLocation,
} from "@/features/addresses/queries";

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
   Cart, plans, quotes and checkout
   ------------------------------------------------------------------------- */

/**
 * They live in `./group/queries.ts`, against the published contract.
 *
 * The singleton hooks that used to sit here — `useCart` returning one item,
 * `usePutCart` with its `replace_existing` confirmation, and `useQuote` priced
 * from one cart item and one signed window — are gone rather than adapted. They
 * modelled a cardinality the product no longer has: adding a second service is
 * an append, so a dialog whose whole purpose was to confirm discarding the first
 * one has nothing left to ask.
 *
 * `POST /quotes/` and `PUT /cart/` remain in the contract as an expand-phase
 * compatibility surface. Nothing in this app calls them, and
 * `contract-pending/boundary.test.ts` fails the build if that changes.
 */
