"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import {
  EXPIRING_STATE,
  SESSION_STATE,
  VOLATILE_STATE,
  publishToTabs,
  queryKeys,
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import { toWindowsView, type WindowsView } from "@/features/booking/adapters";
import { cartVersionConflict, type MergeAction } from "./conflicts";
import { checkoutIntentKey, planQuoteIntentKey, planSetIntentKey } from "./intents";

/**
 * The multi-item Cart → Fulfilment Plan → group Quote → Checkout server layer
 * (published contract 1.10.0).
 *
 * Every function here is a pure adapter over the generated client: it sends what
 * the operation declares and returns what the operation returns. No total is
 * summed, no plan is composed, no eligibility is judged and no window is shifted.
 * Django owns all of that, which is what makes the screens above renderers of a
 * server answer rather than a second implementation of it.
 *
 * ## Cache rules
 *
 * Every cart command returns the whole `Cart`, so success is a targeted
 * `setQueryData` rather than a refetch — the response *is* the new truth, and
 * asking again would only introduce a window where the screen shows the old
 * version.
 *
 * A cart mutation invalidates plan sets and quotes and nothing else. Those are
 * the only cached answers a cart change can falsify; catalog, addresses and
 * reference data are untouched, so a customer who edits a quantity does not pay
 * for a catalog refetch.
 *
 * ## Retry rules
 *
 * No mutation auto-retries. The idempotent commands *could* be resent safely
 * because their keys are stable, but "safe to resend" is not "should resend": a
 * 409 means the world changed, and re-sending hides a decision the customer has
 * to make. Reads retry per the shared policy; a 404 or a 409 does not.
 */

/* -------------------------------------------------------------------------
   Cart
   ------------------------------------------------------------------------- */

export type Cart = Schemas["Cart"];
export type CartItem = Schemas["CartItemDetail"];

/**
 * The customer's or session's one active cart.
 *
 * `GET /cart/` is also where Django performs the automatic login merge: for an
 * authenticated caller it folds in any non-duplicate anonymous items and, when a
 * decision is genuinely needed, refuses with `cart_merge_conflict` instead of
 * picking a winner. That refusal is a state this screen renders, not a failure
 * to retry through — resending would just produce the same refusal.
 */
export function useCart(enabled = true) {
  return useQuery({
    queryKey: queryKeys.booking.cart(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/cart/")),
    enabled,
    ...SESSION_STATE,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 409 || error.status === 404)
        ? false
        : failureCount < 2,
  });
}

/**
 * Applies a command's authoritative cart response and drops what it falsified.
 *
 * Plan sets and quotes derived from the previous cart version are exactly the
 * things Django marks `INVALIDATED`, so removing them locally keeps the cache
 * from serving a plan the server has already withdrawn.
 */
function useApplyCart() {
  const queryClient = useQueryClient();

  return (cart: Cart) => {
    queryClient.setQueryData(queryKeys.booking.cart(), cart);
    void queryClient.invalidateQueries({ queryKey: queryKeys.booking.planSets() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.booking.planQuotes() });
    publishToTabs({ type: "cache.invalidate", queryKey: queryKeys.booking.all });
  };
}

/**
 * Refetches authoritative cart state after the server rejected a stale version.
 *
 * Called before the customer is asked to decide again, because deciding against
 * a version the server has left behind produces a second conflict rather than a
 * result.
 */
function useRefetchCartOnStaleVersion() {
  const queryClient = useQueryClient();

  return (error: unknown) => {
    if (cartVersionConflict(error) === null) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
  };
}

export interface AddCartItemInput {
  expectedCartVersion: number;
  variantId: string;
  quantity: number;
  scope?: Record<string, unknown>;
}

/**
 * Appends a service request.
 *
 * An append, never a replacement: a different service is a second item, and an
 * *identical* one is refused with `duplicate_cart_item` pointing at the item
 * already there. Neither outcome deletes anything the customer configured.
 */
export function useAddCartItem() {
  const applyCart = useApplyCart();
  const refetchOnStale = useRefetchCartOnStaleVersion();

  return useMutation({
    mutationFn: (input: AddCartItemInput) =>
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
    onSuccess: applyCart,
    onError: refetchOnStale,
    retry: false,
  });
}

export interface UpdateCartItemInput {
  itemId: string;
  expectedCartVersion: number;
  expectedItemVersion: number;
  quantity: number;
  scope?: Record<string, unknown>;
}

/**
 * Edits one item under both optimistic-concurrency guards.
 *
 * Both versions are sent every time. The cart version catches "something else in
 * this cart changed"; the item version catches "this item changed" — a second
 * tab can bump one without the other, and sending only one would let that edit
 * through unnoticed.
 *
 * No optimistic cache write. An optimistic quantity is a claim the server has
 * not agreed to, and here it can be refused outright by a version conflict.
 */
export function useUpdateCartItem() {
  const applyCart = useApplyCart();
  const refetchOnStale = useRefetchCartOnStaleVersion();

  return useMutation({
    mutationFn: (input: UpdateCartItemInput) =>
      request(() =>
        getApiClient().PATCH("/api/v1/cart/items/{item_id}/", {
          params: { path: { item_id: input.itemId } },
          body: {
            expected_cart_version: input.expectedCartVersion,
            expected_item_version: input.expectedItemVersion,
            quantity: input.quantity,
            ...(input.scope ? { scope: input.scope } : {}),
          },
        }),
      ),
    onSuccess: applyCart,
    onError: refetchOnStale,
    retry: false,
  });
}

export interface RemoveCartItemInput {
  itemId: string;
  expectedCartVersion: number;
  expectedItemVersion: number;
}

/**
 * Removes one item through the publishable POST command.
 *
 * Both optimistic versions are required. No `Idempotency-Key`: the version pair
 * is the replay protection. No optimistic cache write — the authoritative Cart
 * response replaces local state only after Django confirms the removal.
 */
export function useRemoveCartItem() {
  const applyCart = useApplyCart();
  const refetchOnStale = useRefetchCartOnStaleVersion();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RemoveCartItemInput) =>
      request(() =>
        getApiClient().POST("/api/v1/cart/items/{item_id}/remove/", {
          params: { path: { item_id: input.itemId } },
          body: {
            expected_cart_version: input.expectedCartVersion,
            expected_item_version: input.expectedItemVersion,
          },
        }),
      ),
    onSuccess: applyCart,
    onError: (error) => {
      refetchOnStale(error);
      // Already-gone / unknown ids: the outcome the customer wanted has happened.
      // Refetch so the row disappears from authoritative state rather than leaving
      // a stale list that still invites another remove.
      if (error instanceof ApiRequestError && error.code === "cart_item_not_found") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
      }
    },
    retry: false,
  });
}

export interface MergeCartInput {
  expectedCustomerCartVersion: number;
  expectedSessionCartVersion: number;
  decisions: { sessionItemId: string; action: MergeAction }[];
}

/**
 * Resolves a login merge with the customer's own decisions.
 *
 * Every overlapping item carries an explicit action. Django refuses the whole
 * command with `DECISION_REQUIRED` if one is missing, which is the property that
 * makes "no side silently wins" enforceable rather than aspirational — this
 * client cannot default a choice even by omission.
 */
export function useMergeCart() {
  const applyCart = useApplyCart();

  return useMutation({
    mutationFn: (input: MergeCartInput) =>
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
    onSuccess: applyCart,
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Preferred start
   ------------------------------------------------------------------------- */

export interface WindowsInput {
  cartVersion: number;
  addressId: string;
}

/**
 * Server-authored candidate start times for the current cart and address.
 *
 * Used as the source of `preferred_start`, which the plan-set command requires
 * as a customer input. Only the server's own `starts_at` values are offered, so
 * no time is composed here; the opaque signed window id belongs to the superseded
 * single-item quote flow and is deliberately not read.
 *
 * The availability flags are honest for what they are: they rule out times that
 * are past, too soon or outside operating hours for *any* work. They are not a
 * multi-item capacity promise, and the screen says so — the plan set is what
 * answers whether the whole cart fits.
 *
 * `VOLATILE_STATE`, because a cached list of times is a claim the server has
 * stopped standing behind.
 */
export function useCandidateStarts(input: WindowsInput | null) {
  return useQuery<WindowsView>({
    queryKey: queryKeys.booking.windows({
      cartVersion: input?.cartVersion ?? 0,
      addressId: input?.addressId ?? "",
    }),
    queryFn: async () =>
      toWindowsView(
        await request(() =>
          getApiClient().POST("/api/v1/booking/windows/", {
            body: { address_id: input!.addressId },
          }),
        ),
      ),
    enabled: input !== null,
    ...VOLATILE_STATE,
  });
}

/* -------------------------------------------------------------------------
   Scheduling groups
   ------------------------------------------------------------------------- */

export type SchedulingGroup = Schemas["SchedulingGroup"];

export interface SchedulingGroupsInput {
  cartVersion: number;
  addressId: string;
}

/**
 * The visits this cart splits into, published before any time is chosen.
 *
 * This is what the slot picker renders: one row per visit, each taking its own
 * start. The client does not decide which services share a professional — that
 * is a compatibility rule Django owns, and a second implementation in the browser
 * would eventually offer a visit the planner refuses to build.
 *
 * `VOLATILE_STATE` because the grouping is derived from effective-dated rules
 * Operations can retire; a cached answer is a claim the server has stopped
 * standing behind. Keyed by cart version *and* address, because both change the
 * answer and serving one cart's visits for another produces `group_key`s the
 * plan-set command will refuse.
 */
export function useSchedulingGroups(input: SchedulingGroupsInput | null) {
  return useQuery({
    queryKey: queryKeys.booking.schedulingGroups({
      cartVersion: input?.cartVersion ?? 0,
      addressId: input?.addressId ?? "",
    }),
    queryFn: async () =>
      (
        await request(() =>
          getApiClient().POST("/api/v1/cart/scheduling-groups/", {
            body: {
              address_id: input!.addressId,
              expected_cart_version: input!.cartVersion,
            },
          }),
        )
      ).groups,
    enabled: input !== null,
    ...VOLATILE_STATE,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 409 || error.status === 404)
        ? false
        : failureCount < 2,
  });
}

/* -------------------------------------------------------------------------
   Fulfilment plans
   ------------------------------------------------------------------------- */

export type PlanSet = Schemas["FulfilmentPlanSet"];
export type Plan = Schemas["FulfilmentPlan"];
export type PlanUnit = Schemas["PlanUnit"];

export interface CreatePlanSetInput {
  cartVersion: number;
  addressId: string;
  /**
   * One chosen start per published visit.
   *
   * Every group Django published must appear exactly once. A missing one is
   * refused with `scheduling_groups_changed` rather than defaulted — the server
   * will not pick a time on the customer's behalf for work they never scheduled,
   * and neither does this client.
   */
  preferredStarts: readonly { groupKey: string; startsAt: string }[];
}

/**
 * Asks Django how this cart can be fulfilled.
 *
 * The response is the whole answer: which services share a visit, which run in
 * parallel, which need their own visit, how many professionals, what each unit
 * costs and why it was separated. Nothing about that structure is decided here,
 * and the alternatives are rendered in the order the server ranked them.
 */
export function useCreatePlanSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlanSetInput) =>
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
    retry: false,
  });
}

/**
 * Re-reads one plan set by id.
 *
 * `EXPIRING_STATE`: the set carries its own `expires_at` and `status`, and a
 * cached `ACTIVE` plan is precisely the thing that stops being true without the
 * browser hearing about it.
 */
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

/* -------------------------------------------------------------------------
   Selected-plan quote
   ------------------------------------------------------------------------- */

export type GroupQuote = Schemas["GroupQuote"];
export type GroupQuoteUnit = Schemas["GroupQuoteUnit"];
export type GroupQuoteLine = Schemas["GroupQuoteLine"];

/** Prices one chosen alternative into an immutable group quote. */
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

/**
 * Re-reads one group quote by id, including its historical states.
 *
 * `INVALIDATED`, `EXPIRED` and `CONSUMED` quotes stay readable by design, so a
 * customer returning to a stale link sees what they were quoted and why it no
 * longer applies rather than a dead end.
 */
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

/* -------------------------------------------------------------------------
   Checkout
   ------------------------------------------------------------------------- */

export type Checkout = Schemas["Checkout"];
export type BookingGroup = Schemas["BookingGroup"];
export type FulfilmentUnit = Schemas["FulfilmentUnit"];

/**
 * Confirms the quote and materialises the Booking Group.
 *
 * There is still no customer `GET /checkouts/{id}/`, so this response is the
 * only view of the *checkout* the browser holds. The Booking Group it created is
 * a different matter: 1.9.0 published `GET /booking-groups/` and
 * `GET /booking-groups/{group_id}/`, plus a versioned idempotent cancel. Those
 * reads are FE-09's to integrate, so nothing here polls them — but the
 * confirmation screen must not claim they do not exist.
 *
 * Payment is still absent (BE-08), which is why confirmation charges nothing.
 */
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
