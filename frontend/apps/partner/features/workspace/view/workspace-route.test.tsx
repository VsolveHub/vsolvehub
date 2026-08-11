import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspaces read, wired to a real endpoint at last.
 *
 * Closes the mounted half of `M2-FE-110` and `M2-FE-113`. The guard's own tests
 * prove the decisions against hand-built grant lists; these prove the route
 * makes the same decisions against what `GET /api/v1/partner/workspaces/`
 * actually returns — including the two answers that are easy to confuse, an
 * empty list and an unread one.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/workforce",
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { WorkspaceRoute } = await import("./workspace-route");
const { WORKFORCE_WORKSPACE, PROJECT_WORKSPACE } = await import("../registry");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function grantsPayload(...rows: { workspace_key: string; actions: string[] }[]) {
  return {
    workspaces: rows.map((row) => ({ ...row, commercial_mode: "LEAD_ONLY" })),
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderRoute(workspaceKey: string, actions?: string[]) {
  return render(
    <WorkspaceRoute workspaceKey={workspaceKey} actions={actions}>
      {(workspace) => <p>Inside {workspace.label}</p>}
    </WorkspaceRoute>,
    { wrapper },
  );
}

beforeEach(() => {
  replace.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("reading what the Partner is approved for", () => {
  it("asks the published endpoint and nothing else", async () => {
    client.GET.mockResolvedValue(
      ok(grantsPayload({ workspace_key: WORKFORCE_WORKSPACE, actions: ["enquiry.view"] })),
    );

    renderRoute(WORKFORCE_WORKSPACE);

    await screen.findByText(/inside workforce/i);
    expect(client.GET).toHaveBeenCalledWith("/api/v1/partner/workspaces/");
  });

  it("authorizes before it renders, never the other way round", async () => {
    // A screen drawn first and corrected afterwards is one whose controls were
    // live for a frame. The Partner sees the question being asked instead.
    client.GET.mockReturnValue(new Promise(() => {}));

    renderRoute(WORKFORCE_WORKSPACE);

    expect(await screen.findByText(/checking what you are approved for/i)).toBeInTheDocument();
    expect(screen.queryByText(/inside workforce/i)).toBeNull();
  });

  it("renders the workspace the grant carries", async () => {
    client.GET.mockResolvedValue(
      ok(
        grantsPayload(
          { workspace_key: WORKFORCE_WORKSPACE, actions: ["enquiry.view"] },
          { workspace_key: PROJECT_WORKSPACE, actions: ["stage.submit_evidence"] },
        ),
      ),
    );

    renderRoute(PROJECT_WORKSPACE);

    expect(await screen.findByText(/inside projects/i)).toBeInTheDocument();
    expect(screen.queryByText(/inside workforce/i)).toBeNull();
  });
});

describe("a workspace the Partner does not hold", () => {
  it("says so and shows nothing of it", async () => {
    // `200 {"workspaces": []}` is a real, common state — registered, not yet
    // approved — and 0012 §A1 also uses it for a suspension. Either way there is
    // no workspace to draw.
    client.GET.mockResolvedValue(ok({ workspaces: [] }));

    renderRoute(WORKFORCE_WORKSPACE);

    expect(await screen.findByText(/no longer on your account/i)).toBeInTheDocument();
    expect(screen.queryByText(/inside workforce/i)).toBeNull();
  });

  it("recovers to the base app, never to Jobs", async () => {
    client.GET.mockResolvedValue(ok({ workspaces: [] }));

    const { container } = renderRoute(WORKFORCE_WORKSPACE);
    await screen.findByText(/no longer on your account/i);

    const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).not.toContain("/jobs");
  });

  it("does not move the Partner off the route", async () => {
    // Withdrawn keeps its screens: the records behind them are still theirs to
    // read. Only a key with no screens at all forces a redirect.
    client.GET.mockResolvedValue(ok({ workspaces: [] }));

    renderRoute(WORKFORCE_WORKSPACE);
    await screen.findByText(/no longer on your account/i);

    expect(replace).not.toHaveBeenCalled();
  });
});

describe("a grant list that could not be read", () => {
  /**
   * Refused rather than dropped, so the assertion is not racing a retry backoff:
   * a 401/403 is the one failure the hook does not resend, because asking twice
   * walks into the same refusal and delays the honest screen.
   */
  function refused(status: number) {
    return {
      data: undefined,
      error: {
        error: {
          code: "permission_denied",
          message: "Refused.",
          details: null,
          retryable: false,
          request_id: "req_1",
        },
      },
      response: new Response(null, { status }),
    };
  }

  it("fails closed rather than reading a refusal as an empty account", async () => {
    // The distinction the whole read turns on. Django declining to answer must
    // not become "approved for nothing", which would look to the Partner like a
    // suspension nobody applied — and would let the screen offer recovery for
    // something that never happened.
    client.GET.mockResolvedValue(refused(403));

    renderRoute(WORKFORCE_WORKSPACE);

    expect(await screen.findByText(/could not check what you are approved for/i)).toBeInTheDocument();
    expect(screen.queryByText(/no longer on your account/i)).toBeNull();
    expect(screen.queryByText(/inside workforce/i)).toBeNull();
  });

  it("does not resend a refusal", async () => {
    client.GET.mockResolvedValue(refused(403));

    renderRoute(WORKFORCE_WORKSPACE);
    await screen.findByText(/could not check what you are approved for/i);

    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("offers a re-check, because a refetch is what would fix it", async () => {
    client.GET.mockResolvedValue(refused(403));

    renderRoute(WORKFORCE_WORKSPACE);

    expect(await screen.findByRole("button", { name: /check again/i })).toBeInTheDocument();
  });
});

describe("an unknown workspace key", () => {
  it("moves the Partner to the base app and asks Django nothing", async () => {
    // There are no screens behind a key this bundle does not carry, so there is
    // also nothing worth asking on its behalf.
    renderRoute("A9_SOMETHING_NEW");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("a workspace that lost one of its actions", () => {
  it("keeps the screen readable and says what changed", async () => {
    // 0012 §A1's reduced-grant suspension. Disabling the whole page would strand
    // a supervisor mid-shift over a restriction that does not touch attendance.
    client.GET.mockResolvedValue(
      ok(grantsPayload({ workspace_key: WORKFORCE_WORKSPACE, actions: ["attendance.confirm"] })),
    );

    renderRoute(WORKFORCE_WORKSPACE, ["crew.manage"]);

    expect(await screen.findByText(/some actions are no longer available/i)).toBeInTheDocument();
    expect(screen.getByText(/inside workforce/i)).toBeInTheDocument();
  });
});
