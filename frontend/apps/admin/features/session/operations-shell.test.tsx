import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok, refusal, sessionState } from "@/features/shared/fixtures";

/**
 * The Operations shell.
 *
 * The branch worth testing is the one between *holding* a grant and *acting* as
 * it. Django's permissions ask the second question — `IsOperationsUser` and
 * `HasRecentOperationsStepUp` both compare `UserSession.active_role` — so a user
 * with an Operations grant signed in as Customer is refused by every endpoint. A
 * shell that rendered on the grant alone would show a working console where
 * every action returns 403; one that showed "no access" to somebody a
 * role-switch away is how a reviewer concludes their account is broken.
 *
 * That branch is also the front door, not a corner case:
 * `create_authenticated_session` takes the alphabetically first grant and
 * `verify_login_otp` re-grants `customer` on every login, so `customer` beats
 * `operations` for everybody, every time.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

/** The route the shell believes it is on. Set per test. */
const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const { OperationsShell } = await import("./operations-shell");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderShell() {
  return render(
    <OperationsShell>
      <p>Queue</p>
    </OperationsShell>,
    { wrapper },
  );
}

/** A session acting as `role`, granted everything in `grants`. */
function acting(role: string, grants: string[]) {
  return ok(
    sessionState({
      active_role: role,
      user: { ...sessionState().user!, roles: grants },
    }),
  );
}

beforeEach(() => {
  route.pathname = "/";
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("acting as the role, not merely holding it", () => {
  it("renders the console when Django has Operations selected", async () => {
    client.GET.mockResolvedValue(ok(sessionState()));
    renderShell();

    expect(await screen.findByText("Queue")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /Operations workspaces/i })).toBeInTheDocument();
  });

  it("offers the switch when the grant is held but another role is active", async () => {
    client.GET.mockResolvedValue(acting("customer", ["customer", "operations"]));
    renderShell();

    expect(
      await screen.findByRole("button", { name: /switch to operations/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Queue")).not.toBeInTheDocument();
  });

  it("refuses outright when the grant is not held at all", async () => {
    client.GET.mockResolvedValue(acting("customer", ["customer"]));
    renderShell();

    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.getByText(/granted per account/i)).toBeInTheDocument();
    // Offering a switch to a role they do not hold would be a button that
    // cannot work.
    expect(screen.queryByRole("button", { name: /switch to/i })).not.toBeInTheDocument();
  });

  it("shows the sign-in and nothing about what is behind it", async () => {
    client.GET.mockResolvedValue(refusal("not_authenticated", 403));
    renderShell();

    expect(await screen.findByRole("heading", { name: "Operations" })).toBeInTheDocument();
    // The nav is inside the authenticated branch on purpose.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/compatibility rules|dispatch recovery|refunds/i)).not.toBeInTheDocument();
  });
});

describe("the workspaces", () => {
  it("reaches every route this console owns, refunds included", async () => {
    // A page with no link to it is the defect this list exists to prevent —
    // refunds used to sit behind a `finance` role nobody was granted, which was
    // the same problem wearing a permission.
    //
    // Asserted as an exact ordered list rather than a subset, deliberately: a
    // `toContain` check would pass while a newly built workspace sat unreachable,
    // which is precisely how `/operations/*` shipped once already.
    client.GET.mockResolvedValue(ok(sessionState()));
    renderShell();

    const nav = await screen.findByRole("navigation", { name: /Operations workspaces/i });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual([
      // Today
      "/",
      "/operations/cases",
      // Home services
      "/operations/visits",
      "/operations/dispatch",
      "/operations/manual-offers",
      "/operations/assisted-checkouts",
      "/operations/compatibility-rules",
      // Workforce & projects
      "/operations/requests",
      "/operations/work-items",
      "/operations/rate-cards",
      // Marketplace
      "/operations/rentals",
      "/operations/stays",
      "/operations/listings",
      // Partners
      "/reviews",
      "/operations/partners",
      "/operations/crew-documents",
      "/operations/partner-availability",
      "/operations/vendor-plans",
      "/operations/partners/import",
      // Customers
      "/operations/loyalty",
      "/operations/feedback",
      // Money
      "/finance",
      "/operations/payouts",
      "/operations/commercial-policy",
      "/operations/reports",
      // Insights
      "/operations/dashboards/overview",
      // System
      "/operations/kill-switches",
      "/operations/profile",
    ]);
  });

  it("marks the workspace being looked at, and only that one", async () => {
    route.pathname = "/operations/dispatch";
    client.GET.mockResolvedValue(ok(sessionState()));
    renderShell();

    const current = await screen.findAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/operations/dispatch");
  });

  it("marks a workspace on its sub-routes too", async () => {
    route.pathname = "/reviews/application-1";
    client.GET.mockResolvedValue(ok(sessionState()));
    renderShell();

    const current = await screen.findAllByRole("link", { current: "page" });
    expect(current[0]).toHaveAttribute("href", "/reviews");
  });
});
