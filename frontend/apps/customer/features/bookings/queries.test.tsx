import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { queryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, groupPage, refusal, unit } from "./fixtures";

/**
 * The Booking Group read/cancel layer.
 *
 * Three properties are worth a test each, because each fails quietly: the poll
 * must stop, the cancel must carry a version and a stable key, and a refused
 * cancel must end at server truth rather than at a local guess.
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
  cancelIntentKey,
  isSettled,
  isTerminal,
  useBookingGroup,
  useBookingGroups,
  useCancelBookingGroup,
} = await import("./queries");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
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

describe("when polling stops", () => {
  it("treats a finished group as settled", () => {
    for (const status of ["BOOKED", "CANCELLED", "EXPIRED", "FAILED"] as const) {
      expect(isSettled(group({ status }))).toBe(true);
      expect(isTerminal(group({ status }))).toBe(true);
    }
  });

  it("treats a group waiting on the customer as settled for polling, but not finished", () => {
    // Nothing Celery does will move these along, so asking again on a timer is
    // asking the server a question only the customer can answer. They are not
    // terminal, though — the customer can still act.
    for (const status of ["REPLAN_REQUIRED", "PAYMENT_PENDING"] as const) {
      expect(isSettled(group({ status }))).toBe(true);
      expect(isTerminal(group({ status }))).toBe(false);
    }
  });

  it("keeps watching while the platform is still working", () => {
    for (const status of ["CONFIRMED", "MATCHING", "PARTIALLY_HELD", "ALL_UNITS_HELD"] as const) {
      expect(isSettled(group({ status }))).toBe(false);
    }
  });

  it("keeps watching a partially held group, which is pending and not success", () => {
    // The one that matters: under ALL_OR_NOTHING a partially held group has
    // booked nothing, so stopping here would freeze the screen mid-search.
    expect(isSettled(group({ status: "PARTIALLY_HELD" }))).toBe(false);
  });
});

describe("reading", () => {
  it("reads the list without asking for a cursor the contract does not publish", async () => {
    client.GET.mockResolvedValue(ok(groupPage()));

    const { result } = renderHook(() => useBookingGroups(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.GET).toHaveBeenCalledWith("/api/v1/booking-groups/");
  });

  it("reads one group by id", async () => {
    client.GET.mockResolvedValue(ok(group()));

    const { result } = renderHook(() => useBookingGroup("group-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.GET).toHaveBeenCalledWith("/api/v1/booking-groups/{group_id}/", {
      params: { path: { group_id: "group-1" } },
    });
  });

  it("does not ask until it has an id", () => {
    renderHook(() => useBookingGroup(null), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("does not retry a group that is not the caller's", async () => {
    client.GET.mockResolvedValue(refusal("permission_denied", 403));

    const { result } = renderHook(() => useBookingGroup("group-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("keeps two groups in separate cache entries", () => {
    expect(queryKeys.booking.group("a")).not.toEqual(queryKeys.booking.group("b"));
  });

  it("keeps groups out of reach of plan and quote invalidation", () => {
    // A cart edit invalidates plans and quotes. A materialized Booking Group has
    // left the cart behind and must not be dropped with them.
    const groupKey = queryKeys.booking.group("g-1").join("/");
    expect(groupKey.startsWith(queryKeys.booking.planSets().join("/"))).toBe(false);
    expect(groupKey.startsWith(queryKeys.booking.planQuotes().join("/"))).toBe(false);
  });
});

describe("cancelling", () => {
  it("sends the version the customer saw, under a stable key", async () => {
    client.POST.mockResolvedValue(ok(group({ status: "CANCELLED", version: 2 })));

    const { result } = renderHook(() => useCancelBookingGroup(), { wrapper });
    result.current.mutate({ groupId: "group-1", expectedVersion: 1 });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/booking-groups/{group_id}/cancel/");
    expect(init.body).toEqual({ expected_version: 1 });
    expect(init.params.path).toEqual({ group_id: "group-1" });
    expect(init.params.header["Idempotency-Key"]).toBe(
      cancelIntentKey({ groupId: "group-1", expectedVersion: 1 }),
    );
  });

  it("reuses the key when the same cancellation is retried", () => {
    // A double-tap or a reconnect mid-request must reach the same command.
    expect(cancelIntentKey({ groupId: "g", expectedVersion: 3 })).toBe(
      cancelIntentKey({ groupId: "g", expectedVersion: 3 }),
    );
  });

  it("mints a new key once the group has moved on", () => {
    // Cancelling at version 4 is a different command against a different world.
    // Reusing version 3's key would make Django answer `idempotency_key_reused`
    // instead of doing the work.
    expect(cancelIntentKey({ groupId: "g", expectedVersion: 3 })).not.toBe(
      cancelIntentKey({ groupId: "g", expectedVersion: 4 }),
    );
    expect(cancelIntentKey({ groupId: "g", expectedVersion: 3 })).not.toBe(
      cancelIntentKey({ groupId: "h", expectedVersion: 3 }),
    );
  });

  it("applies the returned group rather than refetching it", async () => {
    const cancelled = group({ status: "CANCELLED", version: 2 });
    client.POST.mockResolvedValue(ok(cancelled));

    const { result } = renderHook(() => useCancelBookingGroup(), { wrapper });
    result.current.mutate({ groupId: "group-1", expectedVersion: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.booking.group("group-1"))).toEqual(cancelled);
  });

  it("never auto-retries, because a refusal means the world changed", async () => {
    client.POST.mockResolvedValue(refusal("booking_group_version_conflict"));

    const { result } = renderHook(() => useCancelBookingGroup(), { wrapper });
    result.current.mutate({ groupId: "group-1", expectedVersion: 1 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("re-reads the list after a version conflict, so the next decision is informed", async () => {
    queryClient.setQueryData(queryKeys.booking.groups(), groupPage());
    client.POST.mockResolvedValue(refusal("booking_group_version_conflict"));

    const { result } = renderHook(() => useCancelBookingGroup(), { wrapper });
    result.current.mutate({ groupId: "group-1", expectedVersion: 1 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.booking.groups())?.isInvalidated).toBe(true),
    );
  });
});

describe("what the projection does not carry", () => {
  it("exposes no Partner identity for the customer to render", () => {
    // Enforced by the contract; asserted here so a future field addition that
    // leaked one would fail a test that says why it matters.
    const projection = group({ units: [unit({ status: "HELD" })] });
    const serialized = JSON.stringify(projection);

    for (const forbidden of ["partner_id", "partner_name", "phone_number", "partner"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
