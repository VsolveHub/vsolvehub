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

  it("disables approval and warns when application has zero service areas (area pending)", async () => {
    api.setApplication(
      application({
        track: "SERVICES",
        service_area_ids: [],
        area_requests: [{ id: "req-1", postal_code: "509216", status: "WAITING", place: "Mahbubnagar" }],
      }),
    );
    renderDetail();

    expect((await screen.findAllByText(/area pending/i)).length).toBeGreaterThanOrEqual(1);
    const approveBtn = screen.getByRole("button", { name: "Approve" });
    expect(approveBtn).toBeDisabled();
  });

  it("renders requested PIN codes and allows sending back when ready", async () => {
    api.setApplication(
      application({
        track: "SERVICES",
        service_area_ids: ["area-1"],
        area_requests: [
          {
            id: "req-1",
            postal_code: "509001",
            status: "READY",
            covering_area_id: "area-2",
            covering_area_name: "Mahbubnagar Town",
            place: "Mahbubnagar",
          },
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByText("509001")).toBeInTheDocument();
    expect(screen.getByText(/Ready · now in Mahbubnagar Town/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send back to add it" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send back to add it" }));
    expect(screen.getByDisplayValue(/PIN 509001 is now covered by Mahbubnagar Town/i)).toBeInTheDocument();
  });

  it("labels Approve with the areas held and the asked PINs that stay open", async () => {
    api.setApplication(
      application({
        track: "SERVICES",
        service_area_ids: ["area-1", "area-2"],
        area_requests: [
          { id: "r1", postal_code: "509216", status: "WAITING", place: null },
          { id: "r2", postal_code: "500032", status: "DONE", place: "Gachibowli" },
        ],
      }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "Approve · 2 areas, 1 asked PIN stays open" }),
    ).toBeInTheDocument();
  });

  it("shows each area with zone and hours, and flags one that offers none of their services", async () => {
    api.setApplication(
      application({
        track: "SERVICES",
        service_area_ids: ["area-1", "area-2"],
        area_details: [
          { service_area_id: "area-1", name: "Mahbubnagar", zone: "South", hours_set: true, offers_partner_trades: true },
          { service_area_id: "area-2", name: "Miyapur", zone: "West", hours_set: false, offers_partner_trades: false },
        ],
        services_not_offered: ["Gas Stove Repair"],
      }),
    );
    renderDetail();

    expect(await screen.findByText("South")).toBeInTheDocument();
    expect(screen.getByText("Hours ✓")).toBeInTheDocument();
    expect(screen.getByText("No hours")).toBeInTheDocument();
    expect(screen.getByText("Offers none of their services")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve without Miyapur" })).toBeInTheDocument();
    expect(screen.getByText(/Not offered in any chosen area: Gas Stove Repair/)).toBeInTheDocument();
  });

  it("confirms when every chosen service is offered somewhere", async () => {
    api.setApplication(
      application({
        track: "SERVICES",
        service_area_ids: ["area-1"],
        area_details: [
          { service_area_id: "area-1", name: "Mahbubnagar", zone: "", hours_set: true, offers_partner_trades: true },
        ],
        services_not_offered: [],
      }),
    );
    renderDetail();
    expect(
      await screen.findByText(/Every service they chose is offered in at least one of these areas/),
    ).toBeInTheDocument();
  });
});
