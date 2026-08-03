import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { queryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cart, cartItem, groupQuote, planSet, refusal } from "./fixtures";

/**
 * The query layer's contract with the cache.
 *
 * Three properties are worth a test each, because each one fails silently:
 * commands must carry both concurrency versions, a stale-version refusal must
 * end at authoritative server state rather than a local correction, and a cart
 * change must invalidate exactly the answers it falsified — not the catalog a
 * customer would then pay to refetch.
 */

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const {
  useAddCartItem,
  useCart,
  useCreateCheckout,
  useCreatePlanQuote,
  useCreatePlanSet,
  useMergeCart,
  useUpdateCartItem,
} = await import("./queries");
const { cartMergeConflict, isCommandInFlight } = await import("./conflicts");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

/** A transport failure: the request never reached Django, so there is no code. */
function fail(error: unknown) {
  return Promise.reject(error);
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("adding an item", () => {
  it("appends through the items collection, never through the singleton PUT", async () => {
    // `PUT /cart/` with `replace_existing` is the superseded surface. Reaching it
    // would discard a service the customer configured.
    client.POST.mockResolvedValue(ok(cart()));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({
      expectedCartVersion: 3,
      variantId: "variant-2",
      quantity: 1,
      scope: { rooms: 2 },
    });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.PUT).not.toHaveBeenCalled();
    expect(client.POST).toHaveBeenCalledWith("/api/v1/cart/items/", {
      body: {
        expected_cart_version: 3,
        variant_id: "variant-2",
        quantity: 1,
        scope: { rooms: 2 },
      },
    });
  });

  it("never sends a replacement flag, because the command has none", async () => {
    client.POST.mockResolvedValue(ok(cart()));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 3, variantId: "v", quantity: 1 });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const body = client.POST.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("replace_existing");
  });

  it("sends an empty scope as an omitted key, which the backend maps itself", async () => {
    // Adding with no scope answers is supported: Django maps the canonical
    // top-level quantity into the legacy quantity scope requirement. Sending
    // `scope: {}` explicitly would be the frontend guessing at that mapping.
    client.POST.mockResolvedValue(ok(cart()));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 3, variantId: "v", quantity: 2 });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].body).toEqual({
      expected_cart_version: 3,
      variant_id: "v",
      quantity: 2,
    });
  });

  it("appends a second service without touching the first", async () => {
    // The property the whole cart rests on: a different service is an append.
    // The command's response carries both items, and it replaces the cache
    // wholesale — so a first item that vanished here would be a server answer,
    // never a client decision.
    const twoItems = cart({
      version: 4,
      items: [
        cartItem({ id: "item-1", service_name: "Fan installation" }),
        cartItem({ id: "item-2", service_name: "Geyser repair", variant_id: "variant-2" }),
      ],
    });
    client.POST.mockResolvedValue(ok(twoItems));
    queryClient.setQueryData(queryKeys.booking.cart(), cart({ version: 3 }));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 3, variantId: "variant-2", quantity: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = queryClient.getQueryData<ReturnType<typeof cart>>(queryKeys.booking.cart());
    expect(stored?.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
  });
});

describe("editing and concurrency", () => {
  it("sends both the cart version and the item version", async () => {
    // A second tab can bump one without the other. Sending only one would let
    // that edit through unnoticed.
    client.PATCH.mockResolvedValue(ok(cart()));

    const { result } = renderHook(() => useUpdateCartItem(), { wrapper });
    result.current.mutate({
      itemId: "item-1",
      expectedCartVersion: 4,
      expectedItemVersion: 2,
      quantity: 3,
    });

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    expect(client.PATCH).toHaveBeenCalledWith("/api/v1/cart/items/{item_id}/", {
      params: { path: { item_id: "item-1" } },
      body: { expected_cart_version: 4, expected_item_version: 2, quantity: 3 },
    });
  });

  it("refetches authoritative cart state after a stale-version refusal", async () => {
    // The customer has to decide again, and deciding against a version the
    // server has left behind produces a second conflict rather than a result.
    queryClient.setQueryData(queryKeys.booking.cart(), cart({ version: 4 }));
    client.PATCH.mockResolvedValue(refusal("cart_version_conflict", { current_version: 9 }));
    client.GET.mockResolvedValue(ok(cart({ version: 9 })));

    const { result } = renderHook(() => useUpdateCartItem(), { wrapper });
    result.current.mutate({
      itemId: "item-1",
      expectedCartVersion: 4,
      expectedItemVersion: 2,
      quantity: 3,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.booking.cart())?.isInvalidated).toBe(true),
    );
  });

  it("updates one item without disturbing the others in the cache", async () => {
    // The response is the whole cart, so "the other item is unchanged" is a
    // server guarantee this asserts rather than a merge this client performs.
    queryClient.setQueryData(
      queryKeys.booking.cart(),
      cart({ version: 4, items: [cartItem({ id: "item-1" }), cartItem({ id: "item-2" })] }),
    );
    client.PATCH.mockResolvedValue(
      ok(
        cart({
          version: 5,
          items: [
            cartItem({ id: "item-1", quantity: 3, version: 2 }),
            cartItem({ id: "item-2", quantity: 1, version: 1 }),
          ],
        }),
      ),
    );

    const { result } = renderHook(() => useUpdateCartItem(), { wrapper });
    result.current.mutate({
      itemId: "item-1",
      expectedCartVersion: 4,
      expectedItemVersion: 1,
      quantity: 3,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = queryClient.getQueryData<ReturnType<typeof cart>>(queryKeys.booking.cart());
    expect(stored?.items.find((item) => item.id === "item-2")).toMatchObject({
      quantity: 1,
      version: 1,
    });
    expect(stored?.items.find((item) => item.id === "item-1")?.quantity).toBe(3);
  });

  it("does not retry a refused mutation", async () => {
    client.PATCH.mockResolvedValue(refusal("cart_version_conflict"));

    const { result } = renderHook(() => useUpdateCartItem(), { wrapper });
    result.current.mutate({
      itemId: "item-1",
      expectedCartVersion: 4,
      expectedItemVersion: 2,
      quantity: 3,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.PATCH).toHaveBeenCalledTimes(1);
  });
});

describe("cache invalidation is targeted", () => {
  it("replaces the cart from the command's own response", async () => {
    const updated = cart({ version: 5, items: [cartItem(), cartItem({ id: "item-2" })] });
    client.POST.mockResolvedValue(ok(updated));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 4, variantId: "v", quantity: 1 });

    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.booking.cart())).toEqual(updated),
    );
  });

  it("drops plans and quotes, which the cart change falsified", async () => {
    queryClient.setQueryData(queryKeys.booking.planSet("ps-1"), planSet());
    queryClient.setQueryData(queryKeys.booking.planQuote("q-1"), groupQuote());
    client.POST.mockResolvedValue(ok(cart({ version: 5 })));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 4, variantId: "v", quantity: 1 });

    await waitFor(() =>
      expect(
        queryClient.getQueryState(queryKeys.booking.planSet("ps-1"))?.isInvalidated,
      ).toBe(true),
    );
    expect(queryClient.getQueryState(queryKeys.booking.planQuote("q-1"))?.isInvalidated).toBe(
      true,
    );
  });

  it("leaves catalog, address and reference data alone", async () => {
    // Editing a quantity must not make a customer pay to refetch the catalog.
    queryClient.setQueryData(queryKeys.catalog.categories(), [{ slug: "electrical" }]);
    queryClient.setQueryData(queryKeys.addresses.list(), [{ id: "addr-1" }]);
    queryClient.setQueryData(queryKeys.reference.serviceAreas(), [{ id: "area-1" }]);
    client.POST.mockResolvedValue(ok(cart({ version: 5 })));

    const { result } = renderHook(() => useAddCartItem(), { wrapper });
    result.current.mutate({ expectedCartVersion: 4, variantId: "v", quantity: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of [
      queryKeys.catalog.categories(),
      queryKeys.addresses.list(),
      queryKeys.reference.serviceAreas(),
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });
});

describe("query key isolation", () => {
  it("keys candidate start times by cart version as well as address", () => {
    // A list of times fetched for a two-service cart is not the answer for a
    // three-service one.
    expect(queryKeys.booking.windows({ cartVersion: 3, addressId: "a" })).not.toEqual(
      queryKeys.booking.windows({ cartVersion: 4, addressId: "a" }),
    );
    expect(queryKeys.booking.windows({ cartVersion: 3, addressId: "a" })).not.toEqual(
      queryKeys.booking.windows({ cartVersion: 3, addressId: "b" }),
    );
  });

  it("nests plan sets and quotes under keys their bulk invalidation can reach", () => {
    expect(queryKeys.booking.planSet("ps-1")).toEqual([
      ...queryKeys.booking.planSets(),
      "ps-1",
    ]);
    expect(queryKeys.booking.planQuote("q-1")).toEqual([
      ...queryKeys.booking.planQuotes(),
      "q-1",
    ]);
  });

  it("keeps two plan sets and two quotes in separate cache entries", () => {
    expect(queryKeys.booking.planSet("ps-1")).not.toEqual(queryKeys.booking.planSet("ps-2"));
    expect(queryKeys.booking.planQuote("q-1")).not.toEqual(queryKeys.booking.planQuote("q-2"));
  });
});

describe("idempotent commands", () => {
  it("sends a stable key on plan creation and reuses it on retry", async () => {
    client.POST.mockImplementation(() => fail(new Error("network")));

    const { result } = renderHook(() => useCreatePlanSet(), { wrapper });
    const input = {
      cartVersion: 3,
      addressId: "addr-1",
      preferredStart: "2026-08-03T10:00:00Z",
    };

    result.current.mutate(input);
    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.mutate(input);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    const [first, second] = client.POST.mock.calls;
    expect(first![1].params.header["Idempotency-Key"]).toBe(
      second![1].params.header["Idempotency-Key"],
    );
    expect(first![1].body).toEqual(second![1].body);
  });

  it("sends a stable key on checkout and reuses it on retry", async () => {
    client.POST.mockImplementation(() => fail(new Error("network")));

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    result.current.mutate("quote-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.mutate("quote-1");
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    const [first, second] = client.POST.mock.calls;
    expect(first![1].params.header["Idempotency-Key"]).toBe(
      second![1].params.header["Idempotency-Key"],
    );
  });

  it("never auto-retries checkout, whatever the failure", async () => {
    client.POST.mockImplementation(() => fail(new Error("network")));

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    result.current.mutate("quote-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("gives a genuinely different command a different key", async () => {
    // The other half of stability. A key that survived a changed body would make
    // Django replay the *first* booking's result for the second booking's
    // request, which is worse than no key at all.
    client.POST.mockResolvedValue(ok(planSet()));

    const { result } = renderHook(() => useCreatePlanSet(), { wrapper });
    const base = {
      cartVersion: 3,
      addressId: "addr-1",
      preferredStart: "2026-08-03T10:00:00Z",
    };

    result.current.mutate(base);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    result.current.mutate({ ...base, cartVersion: 4 });
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));
    result.current.mutate({ ...base, preferredStart: "2026-08-03T14:00:00Z" });
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(3));

    const keys = client.POST.mock.calls.map(
      (call) => call[1].params.header["Idempotency-Key"] as string,
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("does not mint a new key when the component merely re-renders", async () => {
    // Keys derived per render defeat the header entirely: every retry would look
    // like a new intent, and a double-tap would produce two bookings.
    client.POST.mockResolvedValue(ok(groupQuote()));

    const { result, rerender } = renderHook(() => useCreatePlanQuote(), { wrapper });
    result.current.mutate("plan-1");
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));

    rerender();
    rerender();
    result.current.mutate("plan-1");
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    const [first, second] = client.POST.mock.calls;
    expect(first![1].params.header["Idempotency-Key"]).toBe(
      second![1].params.header["Idempotency-Key"],
    );
  });

  it("reuses the checkout key after a duplicate confirmation, so one intent stays one booking", async () => {
    // The customer double-taps Confirm. Both requests must carry the same key,
    // which is what lets Django replay the first result instead of materialising
    // a second Booking Group.
    client.POST.mockResolvedValue(ok({ id: "checkout-1" }));

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    result.current.mutate("quote-1");
    result.current.mutate("quote-1");

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));
    const keys = client.POST.mock.calls.map(
      (call) => call[1].params.header["Idempotency-Key"] as string,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("surfaces an in-flight duplicate rather than resending under a new key", async () => {
    client.POST.mockResolvedValue(refusal("idempotency_in_progress"));

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    result.current.mutate("quote-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
    expect(isCommandInFlight(result.current.error)).toBe(true);
  });
});

describe("login merge", () => {
  it("sends both cart versions and one action per session item", async () => {
    client.POST.mockResolvedValue(ok(cart()));

    const { result } = renderHook(() => useMergeCart(), { wrapper });
    result.current.mutate({
      expectedCustomerCartVersion: 2,
      expectedSessionCartVersion: 5,
      decisions: [
        { sessionItemId: "s-1", action: "KEEP_CUSTOMER" },
        { sessionItemId: "s-2", action: "KEEP_BOTH" },
      ],
    });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST).toHaveBeenCalledWith("/api/v1/cart/merge/", {
      body: {
        expected_customer_cart_version: 2,
        expected_session_cart_version: 5,
        decisions: [
          { session_item_id: "s-1", action: "KEEP_CUSTOMER" },
          { session_item_id: "s-2", action: "KEEP_BOTH" },
        ],
      },
    });
  });
});

describe("reading the cart", () => {
  it("does not retry a merge refusal, which would just re-attempt the merge", async () => {
    client.GET.mockResolvedValue(refusal("cart_merge_conflict", {}));

    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("surfaces the merge refusal as a decidable conflict, not a generic failure", async () => {
    client.GET.mockResolvedValue(
      refusal("cart_merge_conflict", {
        customer_cart_version: 2,
        session_cart_version: 5,
        conflicts: [
          { kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" },
        ],
      }),
    );

    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const conflict = cartMergeConflict(result.current.error);
    expect(conflict).not.toBeNull();
    expect(conflict?.customerCartVersion).toBe(2);
    expect(conflict?.duplicates).toEqual([{ sessionItemId: "s-1", customerItemId: "c-1" }]);
  });
});
