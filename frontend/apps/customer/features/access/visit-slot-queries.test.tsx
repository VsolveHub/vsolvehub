import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const {
  customerVisitSlotChoiceKey,
  useChooseCustomerVisitSlots,
  useCustomerVisitSlotGrid,
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

afterEach(() => queryClient.clear());

describe("Customer visit slot queries", () => {
  it("loads the Customer-owned signed grid for the draft requirement", async () => {
    client.GET.mockResolvedValue(
      ok({
        server_now: "2026-08-25T10:00:00Z",
        visit_duration_minutes: 120,
        availability_is_preliminary: true,
        timezone: "Asia/Kolkata",
        days: [],
      }),
    );

    const { result } = renderHook(() => useCustomerVisitSlotGrid("requirement-42"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.GET).toHaveBeenCalledWith(
      "/api/v1/requirements/{requirement_id}/visit-slots/",
      { params: { path: { requirement_id: "requirement-42" } } },
    );
  });

  it("posts the complete signed-token set with a stable key", async () => {
    client.POST.mockResolvedValue(
      ok({ slots: [], server_now: "2026-08-25T10:00:01Z" }),
    );
    const input = {
      requirementId: "requirement-42",
      slotIds: ["signed-a", "signed-b"],
      selectionVersion: "grid-1:starts-a,starts-b",
    } as const;

    const { result } = renderHook(() => useChooseCustomerVisitSlots(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/requirements/{requirement_id}/visit-slots/",
      {
        params: {
          path: { requirement_id: "requirement-42" },
          header: { "Idempotency-Key": customerVisitSlotChoiceKey(input) },
        },
        body: { slot_ids: ["signed-a", "signed-b"] },
      },
    );
    expect(customerVisitSlotChoiceKey(input)).toBe(customerVisitSlotChoiceKey(input));
    expect(
      customerVisitSlotChoiceKey({ ...input, selectionVersion: "grid-2:starts-a,starts-b" }),
    ).not.toBe(customerVisitSlotChoiceKey(input));
  });
});

