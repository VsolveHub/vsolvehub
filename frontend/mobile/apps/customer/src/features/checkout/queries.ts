// Ported from frontend/apps/customer/features/checkout/queries.ts (cart read and add).
import { isApiRequestError, ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, SESSION_STATE, VOLATILE_STATE, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";
import { toWindowsView, type WindowsView } from "@/features/booking/adapters";

import { cartVersionConflict, type MergeAction } from "./conflicts";
import { checkoutIntentKey, planQuoteIntentKey, planSetIntentKey } from "./intents";

export type Cart = Schemas["Cart"];
export type CartItem = Cart["items"][number];
export type GroupQuote = Schemas["GroupQuote"];
export type SchedulingGroup = Schemas["SchedulingGroup"];
export type PlanSet = Schemas["FulfilmentPlanSet"];

export function useCart(enabled = true) {
  return useQuery({
    queryKey: queryKeys.booking.cart(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/cart/")),
    enabled,
    ...SESSION_STATE,
    retry: (failureCount, error: any) => {
      const isRefusal =
        (isApiRequestError(error) && (error.status === 409 || error.status === 404)) ||
        error?.status === 409 ||
        error?.status === 404;
      return isRefusal ? false : failureCount < 2;
    },
  });
}

export function useAddCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedCartVersion: number; variantId: string; quantity: number; scope?: Record<string, unknown> }) =>
      request(() =>
        getApiClient().POST("/api/v1/cart/items/", {
          body: {
            expected_cart_version: input.expectedCartVersion,
            variant_id: input.variantId,
            quantity: input.quantity,
            ...(input.scope ? { scope: input.scope } : {}),
          },
        }),
      ),
    onSuccess: (cart) => {
      queryClient.setQueryData(queryKeys.booking.cart(), cart);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
      }
    },
    retry: false,
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; expectedCartVersion: number; expectedItemVersion: number; quantity: number }) =>
      request(() =>
        getApiClient().PATCH("/api/v1/cart/items/{item_id}/", {
          params: { path: { item_id: input.itemId } },
          body: {
            expected_cart_version: input.expectedCartVersion,
            expected_item_version: input.expectedItemVersion,
            quantity: input.quantity,
          },
        }),
      ),
    onSuccess: (cart) => queryClient.setQueryData(queryKeys.booking.cart(), cart),
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
      }
    },
    retry: false,
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; expectedCartVersion: number; expectedItemVersion: number }) =>
      request(() =>
        getApiClient().POST("/api/v1/cart/items/{item_id}/remove/", {
          params: { path: { item_id: input.itemId } },
          body: {
            expected_cart_version: input.expectedCartVersion,
            expected_item_version: input.expectedItemVersion,
          },
        }),
      ),
    onSuccess: (cart) => queryClient.setQueryData(queryKeys.booking.cart(), cart),
    retry: false,
  });
}

export function useSchedulingGroups(input: { cartVersion: number; addressId: string } | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.booking.schedulingGroups({
      cartVersion: input?.cartVersion ?? 0,
      addressId: input?.addressId ?? "",
    }),
    queryFn: async () => {
      try {
        const response = await request(() =>
          getApiClient().POST("/api/v1/cart/scheduling-groups/", {
            body: {
              address_id: input!.addressId,
              expected_cart_version: input!.cartVersion,
            },
          }),
        );
        return response.groups;
      } catch (error) {
        // Only attempt recovery if the server explicitly raised a cart_version_conflict.
        // Other 409 codes (e.g. fulfilment_plan_unavailable, cart_merge_conflict)
        // are semantic refusals that must be surfaced without blind retries.
        const versionConflict = cartVersionConflict(error);
        if (versionConflict !== null) {
          // Stale cart version detected (e.g. after session cart merge).
          // Refetch authoritative cart, update the cache, and retry with the updated version.
          const freshCart = await request(() => getApiClient().GET("/api/v1/cart/"));
          queryClient.setQueryData(queryKeys.booking.cart(), freshCart);

          const targetVersion = versionConflict.currentVersion ?? freshCart.version;
          const retryResponse = await request(() =>
            getApiClient().POST("/api/v1/cart/scheduling-groups/", {
              body: {
                address_id: input!.addressId,
                expected_cart_version: targetVersion,
              },
            }),
          );
          queryClient.setQueryData(
            queryKeys.booking.schedulingGroups({
              cartVersion: targetVersion,
              addressId: input!.addressId,
            }),
            retryResponse.groups,
          );
          return retryResponse.groups;
        }
        throw error;
      }
    },
    enabled: Boolean(input && input.addressId),
    ...VOLATILE_STATE,
    retry: (failureCount, error: any) => {
      const isRefusal =
        (isApiRequestError(error) && (error.status === 409 || error.status === 404 || error.status === 400)) ||
        error?.status === 409 ||
        error?.status === 404 ||
        error?.status === 400;
      return isRefusal ? false : failureCount < 2;
    },
  });
}

export function useCreatePlanSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cartVersion: number;
      addressId: string;
      preferredStarts: readonly { groupKey: string; startsAt: string }[];
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/fulfilment-plan-sets/", {
          params: { header: { "Idempotency-Key": planSetIntentKey(input) } },
          body: {
            address_id: input.addressId,
            expected_cart_version: input.cartVersion,
            preferred_starts: input.preferredStarts.map((entry) => ({
              group_key: entry.groupKey,
              starts_at: entry.startsAt,
            })),
          },
        }),
      ),
    onSuccess: (planSet) => {
      queryClient.setQueryData(queryKeys.booking.planSet(planSet.id), planSet);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
      }
    },
    retry: false,
  });
}

export function useCreatePlanQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/plan-quotes/", {
          params: { header: { "Idempotency-Key": planQuoteIntentKey(planId) } },
          body: { plan_id: planId },
        }),
      ),
    onSuccess: (quote) => {
      queryClient.setQueryData(queryKeys.booking.planQuote(quote.id), quote);
    },
    retry: false,
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (quoteId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/checkouts/", {
          params: { header: { "Idempotency-Key": checkoutIntentKey(quoteId) } },
          body: { quote_id: quoteId },
        }),
      ),
    retry: false,
  });
}

export function usePlanSet(planSetId: string | null) {
  return useQuery({
    queryKey: queryKeys.booking.planSet(planSetId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/fulfilment-plan-sets/{plan_set_id}/", {
          params: { path: { plan_set_id: planSetId! } },
        }),
      ),
    enabled: planSetId !== null,
    ...EXPIRING_STATE,
  });
}

export function usePlanQuote(quoteId: string | null) {
  return useQuery({
    queryKey: queryKeys.booking.planQuote(quoteId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/plan-quotes/{quote_id}/", {
          params: { path: { quote_id: quoteId! } },
        }),
      ),
    enabled: quoteId !== null,
    ...EXPIRING_STATE,
  });
}

export function useCandidateStarts(input: { cartVersion: number; addressId: string; groupKey?: string | null } | null) {
  return useQuery<WindowsView>({
    queryKey: queryKeys.booking.windows({
      cartVersion: input?.cartVersion ?? 0,
      addressId: input?.addressId ?? "",
      groupKey: input?.groupKey ?? null,
    }),
    queryFn: async () =>
      toWindowsView(
        await request(() =>
          getApiClient().POST("/api/v1/booking/windows/", {
            body: {
              address_id: input!.addressId,
              ...(input!.groupKey ? { group_key: input!.groupKey } : {}),
            },
          }),
        ),
      ),
    enabled: input !== null,
    ...VOLATILE_STATE,
  });
}

export function useMergeCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      expectedCustomerCartVersion: number;
      expectedSessionCartVersion: number;
      decisions: { sessionItemId: string; action: MergeAction }[];
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/cart/merge/", {
          body: {
            expected_customer_cart_version: input.expectedCustomerCartVersion,
            expected_session_cart_version: input.expectedSessionCartVersion,
            decisions: input.decisions.map((decision) => ({
              session_item_id: decision.sessionItemId,
              action: decision.action,
            })),
          },
        }),
      ),
    onSuccess: (cart) => {
      queryClient.setQueryData(queryKeys.booking.cart(), cart);
    },
    retry: false,
  });
}

export function useCartSuggestions(cartVersion: number | null) {
  return useQuery({
    queryKey: queryKeys.booking.suggestions(cartVersion ?? 0),
    queryFn: async () => (await request(() => getApiClient().POST("/api/v1/cart/suggestions/"))).suggestions,
    enabled: cartVersion !== null,
    ...SESSION_STATE,
  });
}
