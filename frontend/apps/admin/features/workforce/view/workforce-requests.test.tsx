import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stuck requests are a filter on the Requests list. The old Stuck tab showed only each queue's
 * depth, and opening a member meant pasting its request id.
 */

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/operations/requests",
  useSearchParams: () => new URLSearchParams(search.value),
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { WorkforceRequests } = await import("./workforce-requests");

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

const QUEUES = {
  queues: [
    { code: "unmatched", queue_label: "Matching with nobody invited", depth: 2, oldest_at: "2026-11-01T10:00:00Z", recovery_action: "rematch" },
    { code: "inactive", queue_label: "Engagement with no movement for a fortnight", depth: 1, oldest_at: "2026-10-01T10:00:00Z", recovery_action: "" },
    { code: "unreconciled", queue_label: "Booking fee awaiting the provider", depth: 0, oldest_at: null, recovery_action: "reconcile_payment" },
  ],
};

function requestQueries(): Record<string, unknown>[] {
  return client.GET.mock.calls
    .filter(([path]) => path === "/api/v1/operations/requests/")
    .map(([, init]) => (init as { params: { query: Record<string, unknown> } }).params.query);
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkforceRequests />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  search.value = "";
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/operations/queues/") return Promise.resolve(ok(QUEUES));
    if (path === "/api/v1/operations/requests/") return Promise.resolve(ok({ results: [], next: null }));
    return Promise.resolve(ok({}));
  });
});

describe("stuck requests on the Requests list", () => {
  it("shows only queues with something in them", async () => {
    renderList();

    expect(await screen.findByRole("button", { name: /Matching with nobody invited/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no movement for a fortnight/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Booking fee awaiting/ })).not.toBeInTheDocument();
  });

  it("lists one queue's requests on the server and says what clears them", async () => {
    renderList();

    fireEvent.click(await screen.findByRole("button", { name: /Matching with nobody invited/ }));

    await waitFor(() => expect(requestQueries().at(-1)).toMatchObject({ stuck: "unmatched" }));
    // A stuck queue replaces the stage filter: it is already "open and past a deadline".
    expect(requestQueries().at(-1)).not.toHaveProperty("open");
    expect(screen.getByText("Open a request to rematch it.")).toBeInTheDocument();
  });

  it("says when only a person can decide", async () => {
    renderList();

    fireEvent.click(await screen.findByRole("button", { name: /no movement for a fortnight/ }));

    expect(await screen.findByText(/No automatic fix for these/)).toBeInTheDocument();
  });

  it("goes back to the full list", async () => {
    search.value = "stuck=unmatched";
    renderList();

    await waitFor(() => expect(requestQueries()[0]).toMatchObject({ stuck: "unmatched" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show all requests" }));

    await waitFor(() => expect(requestQueries().at(-1)).toMatchObject({ open: true }));
    expect(requestQueries().at(-1)).not.toHaveProperty("stuck");
  });
});
