import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@vsolve/api-client";
import { m2QueryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The M2 requirement query layer's contract with the server and the cache.
 *
 * Six properties, each of which fails silently if it regresses:
 *
 * 1. the list read survives the paginated envelope the server actually sends;
 * 2. an empty list and a failed read stay distinguishable;
 * 3. a 401/403/404 is not resent;
 * 4. submit carries an idempotency key that is stable per requirement;
 * 5. `allow_duplicate` is sent as the Customer's explicit override, never by
 *    default;
 * 6. a `PATCH` sends only the fields that changed, because an absent key and an
 *    explicit `null` mean different things to Django.
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
  useCreateRequirement,
  useMyRequests,
  useProbableDuplicates,
  useRequirement,
  useRequirementTimeline,
  useSaveRequirement,
  useSubmitRequirement,
  submitIntentKey,
} = await import("./queries");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function refusal(status: number, code: string) {
  return Promise.reject(
    new ApiRequestError(status, {
      code,
      message: "Refused.",
      details: null,
      retryable: false,
      request_id: "req_m2",
    }),
  );
}

const SUMMARY = {
  id: "req-1",
  status: "MATCHING",
  category_slug: "housekeeping-staff",
  lifecycle_explanation: "You are hiring people for a period of time.",
  service_by: "2026-08-24",
  quote_delivery_deadline_at: "2026-08-12T18:00:00Z",
  teaser_count: 0,
  closure_reason: null,
  last_activity_at: "2026-08-10T09:33:40Z",
};

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

describe("My requests", () => {
  it("reads rows out of the cursor envelope the view actually returns", async () => {
    // The OpenAPI document declares a bare array and
    // `RequirementCollectionView.get` paginates. Mapping the envelope as an
    // array is a `TypeError` on the first real request.
    client.GET.mockResolvedValue(ok({ next: null, previous: null, results: [SUMMARY] }));

    const { result } = renderHook(() => useMyRequests(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual(["req-1"]);
  });

  it("reads the bare array too, so the fix on the server side is not a breaking change", async () => {
    client.GET.mockResolvedValue(ok([SUMMARY]));

    const { result } = renderHook(() => useMyRequests(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual(["req-1"]);
  });

  it("keeps a failed read distinguishable from an empty one", async () => {
    // The rule the whole file turns on. A dropped connection must never be able
    // to tell a Customer they have never asked for anything.
    client.GET.mockReturnValue(refusal(503, "service_unavailable"));

    const { result } = renderHook(() => useMyRequests(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("asks once for a refusal and does not walk into it again", async () => {
    // A client with TanStack's own default (three attempts), so the single call
    // proves the hook's `retry: shouldRetryM2Read` is actually wired rather
    // than the test client suppressing retries for it.
    queryClient = new QueryClient();
    client.GET.mockReturnValue(refusal(403, "permission_denied"));

    const { result } = renderHook(() => useMyRequests(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("does not ask at all when the caller says not to", async () => {
    renderHook(() => useMyRequests(false), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("one requirement and its timeline", () => {
  it("reads them under separate keys so they can fail independently", async () => {
    client.GET.mockImplementation((path: string) =>
      path.endsWith("/timeline/")
        ? refusal(500, "server_error")
        : Promise.resolve(ok({ id: "req-1", status: "MATCHING" })),
    );

    const detail = renderHook(() => useRequirement("req-1"), { wrapper });
    const timeline = renderHook(() => useRequirementTimeline("req-1"), { wrapper });

    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(timeline.result.current.isError).toBe(true));
    // The half that matters survived the half that did not.
    expect(detail.result.current.data?.status).toBe("MATCHING");
  });

  it("nests the timeline key under the detail so one invalidation reaches both", () => {
    const detail = m2QueryKeys.requirements.detail("req-1");
    const timeline = m2QueryKeys.requirements.timeline("req-1");

    expect(timeline.slice(0, detail.length)).toEqual([...detail]);
  });

  it("asks for nothing without an id", async () => {
    renderHook(() => useRequirement(null), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("the duplicate check", () => {
  it("sends the three inputs the endpoint matches on", async () => {
    client.GET.mockResolvedValue(ok({ probable_duplicates: [] }));

    const { result } = renderHook(
      () =>
        useProbableDuplicates({
          addressId: "addr-1",
          requestedStart: "2026-08-20T00:00:00.000Z",
          variantId: "var-1",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.GET).toHaveBeenCalledWith("/api/v1/requirements/duplicate-check/", {
      params: {
        query: {
          address_id: "addr-1",
          requested_start: "2026-08-20T00:00:00.000Z",
          variant_id: "var-1",
        },
      },
    });
  });

  it("does not ask a partial question", async () => {
    renderHook(() => useProbableDuplicates(null), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("creating and saving a draft", () => {
  it("creates against the variant, not the category", async () => {
    client.POST.mockResolvedValue(ok({ id: "req-1", status: "DRAFT" }));

    const { result } = renderHook(() => useCreateRequirement(), { wrapper });
    result.current.mutate({ variantId: "var-1", answers: { worker_count: 4 }, language: "te-IN" });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST).toHaveBeenCalledWith("/api/v1/requirements/", {
      body: { variant_id: "var-1", answers: { worker_count: 4 }, language: "te-IN" },
    });
  });

  it("sends only the fields that changed", async () => {
    // An absent key and an explicit `null` are different to `PATCH`. Sending
    // the whole draft back would clear an address set on another tab.
    client.PATCH.mockResolvedValue(ok({ id: "req-1", status: "DRAFT" }));

    const { result } = renderHook(() => useSaveRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", additionalDetails: "Third floor, no lift." });

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    const body = client.PATCH.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toEqual({ additional_details: "Third floor, no lift." });
    expect(body).not.toHaveProperty("address_id");
    expect(body).not.toHaveProperty("service_by");
  });

  it("sends an explicit null when the Customer cleared a date", async () => {
    client.PATCH.mockResolvedValue(ok({ id: "req-1", status: "DRAFT" }));

    const { result } = renderHook(() => useSaveRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", serviceBy: null });

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    expect(client.PATCH.mock.calls[0]![1].body).toEqual({ service_by: null });
  });

  it("sends the flexibility window as an integer, which is the source of truth", async () => {
    client.PATCH.mockResolvedValue(ok({ id: "req-1", status: "DRAFT" }));

    const { result } = renderHook(() => useSaveRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", flexibilityDays: 3 });

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    const body = client.PATCH.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toEqual({ flexibility_days: 3 });
    // `is_date_flexible` is published and read-only; writing it would be
    // writing to the server's own derivation of the field beside it.
    expect(body).not.toHaveProperty("is_date_flexible");
  });

  it("re-reads the requirement when a save is refused as locked", async () => {
    // 409 means the requirement left DRAFT while the Customer was typing. The
    // screen is out of date rather than the Customer being wrong.
    client.PATCH.mockReturnValue(refusal(409, "m2_requirement_locked"));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSaveRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", answers: { worker_count: 6 } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: m2QueryKeys.requirements.detail("req-1"),
    });
  });

  it("does not retry a refused save", async () => {
    client.PATCH.mockReturnValue(refusal(409, "m2_requirement_locked"));

    const { result } = renderHook(() => useSaveRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", answers: {} });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.PATCH).toHaveBeenCalledTimes(1);
  });
});

describe("submitting", () => {
  const submitted = {
    id: "req-1",
    status: "MATCHING",
    service_by: "2026-08-24",
    quote_delivery_deadline_at: "2026-08-13T12:00:00Z",
    is_free: true,
    server_now: "2026-08-12T09:00:00Z",
  };

  it("carries an idempotency key that is the same for the same requirement", () => {
    // Submission is a once-per-requirement transition, so every press of "Send"
    // *is* the same command and replaying it after a dropped connection is the
    // behaviour wanted.
    expect(submitIntentKey("req-1")).toBe(submitIntentKey("req-1"));
    expect(submitIntentKey("req-1")).not.toBe(submitIntentKey("req-2"));
  });

  it("sends the key in the header and the override in the body", async () => {
    client.POST.mockResolvedValue(ok(submitted));

    const { result } = renderHook(() => useSubmitRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", allowDuplicate: false });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, options] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/requirements/{requirement_id}/submit/");
    expect(options.params.header["Idempotency-Key"]).toBe(submitIntentKey("req-1"));
    expect(options.body).toEqual({ allow_duplicate: false });
  });

  it("never sends allow_duplicate true on its own", async () => {
    // Sending it by default would turn `GAP-004` into decoration: the duplicate
    // check would run and nothing would ever act on the answer.
    client.POST.mockResolvedValue(ok(submitted));

    const { result } = renderHook(() => useSubmitRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", allowDuplicate: false });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].body.allow_duplicate).toBe(false);
  });

  it("invalidates every requirement read once it is sent", async () => {
    client.POST.mockResolvedValue(ok(submitted));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSubmitRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", allowDuplicate: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: m2QueryKeys.requirements.all });
  });

  it("does not resend under a new key when one is already in flight", async () => {
    // `idempotency_in_progress` means the first attempt is still running. A
    // second key would start a second matching run for one requirement.
    client.POST.mockReturnValue(refusal(409, "idempotency_in_progress"));

    const { result } = renderHook(() => useSubmitRequirement(), { wrapper });
    result.current.mutate({ requirementId: "req-1", allowDuplicate: false });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});
