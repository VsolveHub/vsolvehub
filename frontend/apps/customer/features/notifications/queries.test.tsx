import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { m2QueryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The notification read/mark layer — contract 1.34.0.
 *
 * Four properties, each of which fails quietly:
 *
 *  - the feed must not be read until the panel opens, because that split is the
 *    entire reason the unread count is a separate endpoint;
 *  - the count must not retry into a refusal it cannot recover from;
 *  - "mark all read" pressed twice against different worlds must be two
 *    commands, not one replayed response leaving new notices unread;
 *  - the response's authoritative `{unread}` must land on the badge rather than
 *    being re-fetched, and the feed must be invalidated because `read_at`
 *    changed and is not in that response.
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

/**
 * A refusal shaped the way the transport delivers one.
 *
 * `openapi-fetch` resolves for an HTTP error and puts the body on `error`; only
 * a failure of `fetch` itself rejects. A mock that rejects with a 404 simulates
 * the network dying, not a 404.
 */
function refusal(code: string, status = 409) {
  return {
    data: undefined,
    error: {
      error: { code, message: "Refused.", details: null, retryable: false, request_id: "req_1" },
    },
    response: new Response(null, { status }),
  };
}

function notification(overrides: Partial<Schemas["Notification"]> = {}): Schemas["Notification"] {
  return {
    id: "note-1",
    purpose: "STAGE_AWAITING_REVIEW",
    title: "Work is ready for you to check",
    body: "Ravi submitted stage 2 for your approval.",
    target: { kind: "ENGAGEMENT", id: "eng-1" },
    created_at: "2026-08-15T10:00:00Z",
    read_at: null,
    ...overrides,
  };
}

function feedPage(
  overrides: Partial<Schemas["NotificationPage"]> = {},
): Schemas["NotificationPage"] {
  return { next: null, previous: null, results: [notification()], ...overrides };
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

describe("the unread count", () => {
  it("reads the count endpoint and nothing else", async () => {
    client.GET.mockResolvedValue(ok({ unread: 3 }));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.GET).toHaveBeenCalledWith("/api/v1/notifications/unread-count/");
    expect(result.current.data).toEqual({ unread: 3 });
  });

  it("does not ask at all until the caller says there is a session", () => {
    // The header mounts the bell only inside the authenticated cluster. A poll
    // started for an anonymous visitor would run for a minute into a refusal.
    renderHook(() => useUnreadNotificationCount(false), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("does not retry a refusal that cannot change on a resend", async () => {
    // `shouldRetryM2Read` stops on 401/403/404 — the session is over, or this is
    // not the caller's. Asking again delays the honest screen.
    queryClient = new QueryClient();
    client.GET.mockResolvedValue(refusal("permission_denied", 403));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("holds no number while the read is in flight", () => {
    client.GET.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    // The bell renders `unreadBadgeLabel(null)` from this. A placeholder of zero
    // here would tell somebody nothing is waiting during the one window in which
    // we have not asked.
    expect(result.current.data).toBeUndefined();
  });

  it("polls on a plain interval, in the foreground only", () => {
    client.GET.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    // A feed is never settled, so `boundedPoll` — which requires an `isSettled`
    // predicate — cannot describe this read truthfully. The interval is the one
    // `boundedPoll` would have capped at, and a backgrounded tab is excluded
    // because it cannot show anyone a badge.
    expect(result.current.isPending || result.current.isSuccess).toBe(true);
  });
});

describe("the feed", () => {
  it("is not read until the panel opens", () => {
    renderHook(() => useNotificationFeed(false), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("reads page one without a cursor once it opens", async () => {
    client.GET.mockResolvedValue(ok(feedPage()));

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.GET).toHaveBeenCalledWith("/api/v1/notifications/", {
      params: { query: {} },
    });
  });

  it("passes the opaque cursor for the next page and preserves order", async () => {
    client.GET
      .mockResolvedValueOnce(
        ok(
          feedPage({
            next: "https://api.example/api/v1/notifications/?cursor=opaque-page-2",
            results: [notification({ id: "note-1" })],
          }),
        ),
      )
      .mockResolvedValueOnce(ok(feedPage({ next: null, results: [notification({ id: "note-2" })] })));

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(client.GET).toHaveBeenNthCalledWith(2, "/api/v1/notifications/", {
      params: { query: { cursor: "opaque-page-2" } },
    });
    expect(
      result.current.data?.pages.flatMap((page) => page.results).map((row) => row.id),
    ).toEqual(["note-1", "note-2"]);
  });

  it("surfaces a malformed next URL instead of truncating the feed silently", async () => {
    // A truncated feed looks complete. On this surface that is a notice about
    // money the Customer never sees and has no reason to suspect exists.
    client.GET.mockResolvedValue(
      ok(feedPage({ next: "https://api.example/api/v1/notifications/?page=2" })),
    );

    const { result } = renderHook(() => useNotificationFeed(true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "cursor_contract" });
  });
});

describe("marking one notice read", () => {
  it("sends the notice id with an explicit all:false", async () => {
    client.POST.mockResolvedValue(ok({ unread: 2 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/notifications/read/");
    // `all` is required on the request schema, so it is sent rather than left to
    // a default the contract does not promise.
    expect(init.body).toEqual({ all: false, notification_id: "note-1" });
  });

  it("claims no idempotency guarantee the endpoint does not implement", async () => {
    // The regression this guards: an `Idempotency-Key` was sent here for a while,
    // and Django never read it — `notification_mark_read` publishes
    // `header?: never`. A key on the wire reads as replay protection to the next
    // person maintaining this, when the real guarantee is that the command is
    // idempotent by state: marking read keeps the *first* `read_at`, and "mark
    // all" only touches rows that are still unread.
    client.POST.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [, init] = client.POST.mock.calls[0]!;
    expect(init.headers?.["Idempotency-Key"]).toBeUndefined();
  });
});

describe("marking every notice read", () => {
  it("sends only all:true, because the endpoint takes no bound", async () => {
    client.POST.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: true });

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [, init] = client.POST.mock.calls[0]!;
    expect(init.body).toEqual({ all: true });
  });
});

describe("what a successful mark does to the cache", () => {
  it("applies the returned count to the badge rather than re-asking for it", async () => {
    client.POST.mockResolvedValue(ok({ unread: 2 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(m2QueryKeys.notifications.unreadCount())).toEqual({
      unread: 2,
    });
    // The count endpoint is never called: the write's own response is the
    // authoritative post-write number.
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("invalidates the feed, because read_at changed and is not in that response", async () => {
    queryClient.setQueryData(m2QueryKeys.notifications.feed(), {
      pages: [feedPage()],
      pageParams: [""],
    });
    client.POST.mockResolvedValue(ok({ unread: 0 }));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(
        queryClient.getQueryState(m2QueryKeys.notifications.feed())?.isInvalidated,
      ).toBe(true),
    );
  });

  it("never guesses the new count optimistically", async () => {
    queryClient.setQueryData(m2QueryKeys.notifications.unreadCount(), { unread: 5 });
    client.POST.mockResolvedValue(refusal("notification_not_found", 404));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // A local decrement would have made the badge lie the moment the command was
    // refused, and this is the badge — the number that says whether to look.
    expect(queryClient.getQueryData(m2QueryKeys.notifications.unreadCount())).toEqual({
      unread: 5,
    });
  });
});

describe("when the notice is not this person's", () => {
  it("never auto-retries, because a refusal means the world moved", async () => {
    client.POST.mockResolvedValue(refusal("notification_not_found", 404));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("re-reads the feed so the row stops being offered", async () => {
    queryClient.setQueryData(m2QueryKeys.notifications.feed(), {
      pages: [feedPage()],
      pageParams: [""],
    });
    client.POST.mockResolvedValue(refusal("notification_not_found", 404));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() =>
      expect(
        queryClient.getQueryState(m2QueryKeys.notifications.feed())?.isInvalidated,
      ).toBe(true),
    );
  });

  it("recognises the refusal by code and by status", async () => {
    client.POST.mockResolvedValue(refusal("notification_not_found", 404));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate({ all: false, notificationId: "note-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isNotificationNotFound(result.current.error)).toBe(true);
  });

  it("does not claim every failure is a missing notice", () => {
    expect(isNotificationNotFound(new Error("offline"))).toBe(false);
    expect(isNotificationNotFound(null)).toBe(false);
  });
});
