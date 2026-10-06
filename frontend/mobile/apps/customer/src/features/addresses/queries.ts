// Ported from frontend/apps/customer/features/addresses/queries.ts
import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";

/**
 * The saved address book — one implementation, two callers.
 *
 * These hooks used to live in `features/booking/queries.ts`, where they were
 * reachable only by the booking workspace. The account address book needs the
 * same four operations, and the honest way to give it them is to move the
 * originals here rather than write a second set: two implementations of "save an
 * address" is two cache-writing policies, and the one that loses a race decides
 * which address the customer sees. `features/booking/queries.ts` re-exports from
 * this module, so checkout keeps its imports and gains nothing to reimplement.
 *
 * ## The storage rule this module exists to keep
 *
 * **Exact address text never reaches browser storage, logs or analytics.** Where
 * someone lives is the most sensitive thing this app holds, and the ways it
 * escapes are all boring: a debug `console.log` of a mutation result, an
 * idempotency key derived from the street line, a "last used address" cached in
 * `localStorage` to save a request.
 *
 * So: the TanStack cache is the only place address text lives on the client, and
 * that cache is memory-only — `makeQueryClient` configures no persister, and
 * `gcTime` drops the entry when the screen closes. Nothing here writes to
 * `Storage`, and nothing here logs. The booking workspace already follows the
 * same rule from the other side: `workspace-context.tsx` persists `addressId`
 * and never the address.
 *
 * Note what is *absent*: no `Idempotency-Key`. The contract asks for none on
 * these paths, and `getStableIdempotencyKey` persists its keys in
 * `sessionStorage` — so deriving one from address fields would write the
 * customer's street into storage in the course of protecting a retry.
 * `addresses.storage.test.ts` fails the build if any of this drifts.
 */

export type Address = Schemas["Address"];
export type AddressInput = Schemas["AddressRequest"];
export type AddressPatch = Schemas["PatchedAddressRequest"];
export type ResolvedLocation = Schemas["ReverseGeocodeResponse"];

/**
 * The address a booking should open with.
 *
 * A still-valid explicit choice always wins. Otherwise the Customer's default is selected, with
 * the first saved address as a defensive fallback for older address books that predate the
 * one-default invariant. This is pure so every booking surface follows the same rule.
 */
export function preferredAddressId(
  addresses: readonly Address[],
  selectedAddressId: string | null,
): string | null {
  if (selectedAddressId !== null && addresses.some((address) => address.id === selectedAddressId)) {
    return selectedAddressId;
  }
  return addresses.find((address) => address.is_default)?.id ?? addresses[0]?.id ?? null;
}

/**
 * Turns a coordinate pair into address text.
 *
 * Lives here rather than with the booking flow because its only purpose is to
 * fill in the fields above: `AddressRequest` requires `latitude` and
 * `longitude`, no customer knows theirs, and this is the one published way to
 * get from a device fix to something saveable.
 *
 * A mutation, not a query, even though it reads. The coordinate comes from a
 * one-off permission prompt, so there is no stable key to cache under and
 * nothing that would benefit from being re-fetched on focus — and caching the
 * answer would mean holding address text against a coordinate in a query the
 * screen no longer needs.
 */
export function useReverseGeocode() {
  return useMutation({
    mutationFn: (input: Schemas["ReverseGeocodeRequestRequest"]) =>
      request(() => getApiClient().POST("/api/v1/geocoding/reverse/", { body: input })),
    retry: false,
  });
}

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/addresses/")),
    enabled,
    ...SESSION_STATE,
  });
}

/**
 * Saves a new address.
 *
 * The created record is written into the list from the server's own 201 body,
 * not from the submitted form. Those two differ more often than they look:
 * Django normalises the postal code, stamps `confirmed_at`, and — when
 * `is_default` is set — clears the flag on whichever address held it before.
 * Seeding the cache from the request would show two default addresses until
 * something happened to refetch.
 */
export function useCreateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddressInput) =>
      request(() => getApiClient().POST("/api/v1/addresses/", { body: input })),
    onSuccess: (address) => {
      queryClient.setQueryData<Address[]>(queryKeys.addresses.list(), (current = []) => [
        address,
        ...current.filter((item) => item.id !== address.id),
      ]);
      // A new default demotes another row, and only Django knows which.
      if (address.is_default) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list() });
      }
    },
    retry: false,
  });
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { addressId: string; patch: AddressPatch }) =>
      request(() =>
        getApiClient().PATCH("/api/v1/addresses/{address_id}/", {
          params: { path: { address_id: input.addressId } },
          body: input.patch,
        }),
      ),
    onSuccess: (address) => {
      queryClient.setQueryData(queryKeys.addresses.detail(address.id), address);
      queryClient.setQueryData<Address[]>(queryKeys.addresses.list(), (current = []) =>
        current.map((item) => (item.id === address.id ? address : item)),
      );
      if (address.is_default) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list() });
      }
    },
    retry: false,
  });
}

/**
 * Archives an address, and then asks Django what is left.
 *
 * ## Why this refetches instead of filtering the cached list
 *
 * Every other mutation here writes the server's response body into the cache.
 * `DELETE` answers `204` with no body, so there is nothing to write — and the
 * obvious shortcut, dropping the row from the cached array, is the client
 * deciding what the address book now contains. That is a guess, and it is wrong
 * in a case that actually happens: archiving the default address makes Django
 * promote another one, and a filtered list would show an address book with no
 * default until something else forced a read.
 *
 * So the mutation resolves only once the refetch has landed. `mutateAsync`
 * therefore settles on server truth, and a confirmation dialog that awaits it
 * closes when the deletion is a fact rather than when the request was sent. If
 * the refetch fails the row stays on screen, which is the honest outcome: we no
 * longer know what the server holds.
 */
export function useArchiveAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addressId: string) => {
      await request(() =>
        getApiClient().DELETE("/api/v1/addresses/{address_id}/", {
          params: { path: { address_id: addressId } },
        }),
      );

      queryClient.removeQueries({ queryKey: queryKeys.addresses.detail(addressId) });
      await queryClient.refetchQueries({ queryKey: queryKeys.addresses.list() });
    },
    onSuccess: () => undefined,
    retry: false,
  });
}

/** An address is usable for dispatch once the server has stored coordinates. */
export function isGeocoded(address: Address): boolean {
  return Boolean(address.latitude) && Boolean(address.longitude);
}

/**
 * The one-line form used in lists and confirmations.
 *
 * Returns a string for *rendering*. It must not be passed to `console`,
 * `Storage`, an analytics call or a URL — see the module note.
 */
export function formatAddressLine(address: Address): string {
  return [address.line1, address.line2, address.locality, address.city, address.postal_code]
    .filter(Boolean)
    .join(", ");
}
