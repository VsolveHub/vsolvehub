import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok, refusal, sessionState } from "@/features/shared/fixtures";

/**
 * The staff shell, for two consoles with two roles.
 *
 * The branch worth testing is the one between *holding* a grant and *acting* as
 * it. Django's permissions ask the second question — `IsOperationsUser` and
 * `HasRecentFinanceStepUp` both compare `UserSession.active_role` — so a user
 * with an Operations grant signed in as Customer is refused by every endpoint.
 * A shell that rendered on the grant alone would show a working console where
 * every action returns 403; one that showed "no access" to somebody a
 * role-switch away is how a reviewer concludes their account is broken.
 *
 * The second is reachability. Finance and Operations are different roles, so a
 * Finance-only user landing on the origin must not be shown an Operations denial
 * with nothing on it that leads anywhere — that is the same defect as a page
 * with no link to it.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { OperationsShell } = await import("./operations-shell");
const { FinanceShell } = await import("@/features/finance/view/finance-shell");
const { StaffHome } = await import("./staff-home");

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

describe("acting as the role, not merely holding it", () => {
  it("renders the console when Django has the role selected", async () => {
    client.GET.mockResolvedValue(ok(sessionState()));
    render(
      <OperationsShell>
        <p>Queue</p>
      </OperationsShell>,
      { wrapper },
    );

    expect(await screen.findByText("Queue")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /Operations workspaces/i })).toBeInTheDocument();
  });

  it("offers the switch when the grant is held but another role is active", async () => {
    client.GET.mockResolvedValue(
      ok(
        sessionState({
          active_role: "customer",
          user: { ...sessionState().user!, roles: ["customer", "operations"] },
        }),
      ),
    );
    render(
      <OperationsShell>
        <p>Queue</p>
      </OperationsShell>,
      { wrapper },
    );

    expect(
      await screen.findByRole("button", { name: /switch to operations/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Queue")).not.toBeInTheDocument();
  });

  it("refuses outright when the grant is not held at all", async () => {
    client.GET.mockResolvedValue(
      ok(sessionState({ active_role: "customer", user: { ...sessionState().user!, roles: ["customer"] } })),
    );
    render(
      <OperationsShell>
        <p>Queue</p>
      </OperationsShell>,
      { wrapper },
    );

    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.getByText(/granted per account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch to/i })).not.toBeInTheDocument();
  });

  it("shows the sign-in and nothing about what is behind it", async () => {
    client.GET.mockResolvedValue(refusal("not_authenticated", 403));
    render(
      <OperationsShell>
        <p>Queue</p>
      </OperationsShell>,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Operations" })).toBeInTheDocument();
    // The nav is inside the authenticated branch on purpose.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/compatibility rules|dispatch recovery/i)).not.toBeInTheDocument();
  });
});

describe("Finance is its own role", () => {
  it("refuses an Operations session rather than rendering money commands", async () => {
    client.GET.mockResolvedValue(ok(sessionState({ active_role: "operations" })));
    render(
      <FinanceShell>
        <p>Refunds</p>
      </FinanceShell>,
      { wrapper },
    );

    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.queryByText("Refunds")).not.toBeInTheDocument();
  });

  it("offers the switch to somebody holding both grants", async () => {
    client.GET.mockResolvedValue(
      ok(
        sessionState({
          active_role: "operations",
          user: { ...sessionState().user!, roles: ["operations", "finance"] },
        }),
      ),
    );
    render(
      <FinanceShell>
        <p>Refunds</p>
      </FinanceShell>,
      { wrapper },
    );

    expect(await screen.findByRole("button", { name: /switch to finance/i })).toBeInTheDocument();
  });
});

describe("the origin leads somewhere for both roles", () => {
  it("opens Operations for an Operations session", async () => {
    client.GET.mockResolvedValue(ok(sessionState()));
    render(<StaffHome />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Operations" })).toBeInTheDocument();
  });

  it("points a Finance session at refunds instead of denying them", async () => {
    // Without this the front door is an Operations refusal with no way out, for
    // somebody entitled to a console that exists.
    client.GET.mockResolvedValue(
      ok(
        sessionState({
          active_role: "finance",
          user: { ...sessionState().user!, roles: ["finance"] },
        }),
      ),
    );
    render(<StaffHome />, { wrapper });

    expect(await screen.findByRole("link", { name: /go to refunds/i })).toHaveAttribute(
      "href",
      "/finance",
    );
    expect(screen.queryByText(/do not have access/i)).not.toBeInTheDocument();
  });
});
