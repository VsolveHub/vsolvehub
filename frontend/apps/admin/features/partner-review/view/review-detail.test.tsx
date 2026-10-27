import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may decide, and how a stuck review is handed back.
 *
 * The screen used to treat any assigned reviewer as "me", so it showed decision
 * buttons on a colleague's review that the server would refuse — and there was no
 * way to take over a review whose holder was away.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const COLLEAGUE = "22222222-2222-2222-2222-222222222222";

const api = vi.hoisted(() => {
  const posts: { path: string; body: unknown }[] = [];
  let application: Record<string, unknown> = {};
  const ok = (data: unknown) =>
    Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });

  return {
    posts,
    setApplication: (next: Record<string, unknown>) => {
      application = next;
    },
    client: {
      GET: (path: string) =>
        path === "/api/v1/auth/session/"
          ? ok({ user: { id: "11111111-1111-1111-1111-111111111111", roles: ["operations"] }, active_role: "operations" })
          : ok(application),
      POST: (path: string, init: { body: unknown }) => {
        posts.push({ path, body: init.body });
        return ok(application);
      },
    },
  };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));

const { ReviewDetail } = await import("./review-detail");

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    display_name: "Ravi K.",
    biography: "",
    experience_years: 3,
    status: "UNDER_REVIEW",
    version: 4,
    review_assigned_to_id: ME,
    documents: [],
    ...overrides,
  };
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewDetail applicationId="app-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.posts.length = 0;
});

describe("review detail", () => {
  it("lets the holder decide, decline included", async () => {
    api.setApplication(application());
    renderDetail();

    expect(await screen.findByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows no decisions on a colleague's review, only the way to release it", async () => {
    api.setApplication(application({ review_assigned_to_id: COLLEAGUE }));
    renderDetail();

    expect(await screen.findByText(/another reviewer currently holds this application/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Release to queue" }));

    await waitFor(() =>
      expect(api.posts).toContainEqual({
        path: "/api/v1/operations/partner-applications/{application_id}/release/",
        body: { expected_version: 4 },
      }),
    );
  });

  it("offers a claim on an unheld application, and nothing to release", async () => {
    api.setApplication(application({ status: "SUBMITTED", review_assigned_to_id: null }));
    renderDetail();

    expect(await screen.findByRole("button", { name: "Claim this application" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release to queue" })).toBeNull();
  });

  it("lets any reviewer suspend an approved partner, whoever reviewed them", async () => {
    // The original reviewer stays recorded after approval; that must not lock others out.
    api.setApplication(application({ status: "APPROVED", review_assigned_to_id: COLLEAGUE }));
    renderDetail();

    expect(await screen.findByRole("button", { name: "Suspend" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release to queue" })).toBeNull();
  });
});
