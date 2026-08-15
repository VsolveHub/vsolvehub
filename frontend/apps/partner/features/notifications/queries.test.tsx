import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "@vsolve/api-client";
import { m2QueryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The notification query layer's contract with the server and with the cache.
 *
 * ## The defects these exist to prevent
 *
 * 1. **A badge that keeps hammering a lapsed session.** This read runs on every
 *    authenticated screen for the whole session. A `401` that is retried is a
 *    burst of doomed requests every minute, forever, from every open tab.
 * 2. **A stale digit after the Partner watched a row go read.** The command
 *    answers with the recomputed `{unread}`; if that answer is not written onto
 *    the count key, the old number stays on screen for a round trip and the tap
 *    reads as having failed — which is how somebody taps it again.
 * 3. **A request nobody asked for.** The feed is fetched when the panel opens.
 *    A `useQuery` that ignored `enabled` would pull twenty rendered rows on every
 *    page view for a panel most Partners never open.
 * 4. **A request body the serializer refuses.** `MarkNotificationReadRequestSerializer`
 *    rejects both "neither" and "both", and `all` is required at both ends.
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
  isNotificationNotFound,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
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
      request_id: "req_n1",
    }),
  );
}

const NOTICE = {
  id: "note-1",
  purpose: "m2.engagement.opened",
  title: "The job is open",
  body: "The customer has confirmed.",
  target: { kind: "ENGAGEMENT", id: "eng-1" },
  created_at: "2026-08-15T09:00:00Z",
  read_at: null,
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("the unread count", () => {
  it("reads the badge from the endpoint that answers only the badge", async () => {
    client.GET.mockResolvedValue(ok({ unread: 3 }));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.unread).toBe(3);
    expect(client.GET).toHaveBeenCalledWith("/api/v1/notifications/unread-count/");
  });

  it("keeps its own cache key, separate from the feed's", async () => {
    // One key for both would make the cheap read pay the expensive read's cost on
    // every poll, and would let the panel's refetch reset the badge's interval.
    expect(m2QueryKeys.notifications.unreadCount()).not.toEqual(
      m2QueryKeys.notifications.feed(),
    );

    client.GET.mockResolvedValue(ok({ unread: 2 }));
    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(m2QueryKeys.notifications.unreadCount()),
    ).toEqual({ unread: 2 });
  });

  it("does not ask at all while it is disabled", () => {
    renderHook(() => useUnreadNotificationCount(false), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("does not open a second event stream to stay fresh", () => {
    // Each SSE stream pins a WSGI worker thread for up to five minutes and the A1
    // offer inbox already holds one per tab. The badge is a poll, and this is the
    // check that keeps it one.
    const EventSourceSpy = vi.fn();
    vi.stubGlobal("EventSource", EventSourceSpy);

    client.GET.mockResolvedValue(ok({ unread: 0 }));
    renderHook(() => useUnreadNotificationCount(), { wrapper });

    expect(EventSourceSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("a refused read", () => {
  it("is not resent when the session has lapsed", async () => {
    // The badge runs on every screen for the whole session. Retrying a 401 turns
    // one expired cookie into a burst of doomed requests every minute.
    const retrying = new QueryClient({
      defaultOptions: { queries: { retry: undefined }, mutations: { retry: false } },
    });
    client.GET.mockImplementation(() => refusal(401, "authentication_required"));

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={retrying}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
    retrying.clear();
  });

  it("is not resent when the account cannot read the feed", async () => {
    const retrying = new QueryClient({
      defaultOptions: { queries: { retry: undefined }, mutations: { retry: false } },
    });
    client.GET.mockImplementation(() => refusal(403, "permission_denied"));

    const { result } = renderHook(() => useNotificationFeed(true), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={retrying}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
    retrying.clear();
  });
});

describe("the feed", () => {
  it("is not fetched until the panel opens", () => {
    // Most Partners never open the bell. Fetching twenty rendered rows on every
    // page view for them is the waste the two keys exist to avoid.
    renderHook(() => useNotificationFeed(false), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("reads the cursor envelope Django actually sends", async () => {
    client.GET.mockResolvedValue(ok({ next: null, previous: null, results: [NOTICE] }));

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results.map((row) => row.id)).toEqual(["note-1"]);
    expect(client.GET).toHaveBeenCalledWith("/api/v1/notifications/");
  });

  it("keeps an empty feed distinguishable from a failed one", async () => {
    // The whole point of an honest empty state. `results: []` is success with
    // nothing in it, not an error, and the panel words the two differently.
    client.GET.mockResolvedValue(ok({ next: null, previous: null, results: [] }));

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it("carries a non-null next link through, so truncation can be stated", async () => {
    client.GET.mockResolvedValue(
      ok({ next: "https://api.test/api/v1/notifications/?cursor=cD0y", previous: null, results: [NOTICE] }),
    );

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.next).not.toBeNull();
  });
});

describe("marking a notice read", () => {
  it("sends the id with an explicit all:false, which is what the serializer requires", async () => {
    client.POST.mockResolvedValue(ok({ unread: 2 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ notificationId: "note-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.POST).toHaveBeenCalledWith("/api/v1/notifications/read/", {
      body: { notification_id: "note-1", all: false },
    });
  });

  it("sends all:true with no id, and never both", async () => {
    // "Both" is a 400 — the serializer refuses a request that leaves it guessing
    // which the person actually pressed.
    client.POST.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.POST).toHaveBeenCalledWith("/api/v1/notifications/read/", {
      body: { all: true },
    });
  });

  it("writes the server's recomputed count straight onto the badge", async () => {
    // Not a locally decremented guess — the server's own answer, stored under the
    // key that answer belongs to. Invalidating instead would leave the old digit
    // on screen for a round trip after the row visibly went read.
    queryClient.setQueryData(m2QueryKeys.notifications.unreadCount(), { unread: 5 });
    client.POST.mockResolvedValue(ok({ unread: 4 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ notificationId: "note-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(m2QueryKeys.notifications.unreadCount())).toEqual({
      unread: 4,
    });
  });

  it("sends the feed to re-read rather than patching read_at into it", async () => {
    // `read_at` is a server timestamp and the ordering is the server's. Writing an
    // invented one in would put two authorities on one field.
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    client.POST.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: m2QueryKeys.notifications.feed() });
  });

  it("does not resend a refused command", async () => {
    // Safe to replay, deliberately not replayed: an automatic retry would hide the
    // one failure worth showing, and leave an optimistic screen disagreeing with
    // the server about what is unread.
    const retrying = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: undefined } },
    });
    client.POST.mockImplementation(() => refusal(404, "notification_not_found"));

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={retrying}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ notificationId: "gone" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
    retrying.clear();
  });

  it("leaves the badge alone when the command was refused", async () => {
    // Nothing changed on the server, so nothing changes on screen. A badge that
    // dropped on a failure would be the client asserting a fact it was just told
    // it could not have.
    queryClient.setQueryData(m2QueryKeys.notifications.unreadCount(), { unread: 5 });
    client.POST.mockImplementation(() => refusal(404, "notification_not_found"));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ notificationId: "gone" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(m2QueryKeys.notifications.unreadCount())).toEqual({
      unread: 5,
    });
  });
});

describe("refusals worth naming", () => {
  it("recognises the stale-row refusal and nothing else", () => {
    expect(
      isNotificationNotFound(
        new ApiRequestError(404, {
          code: "notification_not_found",
          message: "Gone.",
          details: null,
          retryable: false,
          request_id: "req_n2",
        }),
      ),
    ).toBe(true);

    expect(
      isNotificationNotFound(
        new ApiRequestError(403, {
          code: "permission_denied",
          message: "No.",
          details: null,
          retryable: false,
          request_id: "req_n3",
        }),
      ),
    ).toBe(false);

    expect(isNotificationNotFound(new Error("offline"))).toBe(false);
    expect(isNotificationNotFound(null)).toBe(false);
  });
});
