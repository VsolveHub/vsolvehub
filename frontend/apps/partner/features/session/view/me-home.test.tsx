import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/workspace/queries", () => ({
  usePartnerWorkspaceGrants: vi.fn(),
}));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useLogout: () => ({ mutate: vi.fn() }),
}));
/*
  Duty state is a provider now, not a card `MeHome` mounts. `useDuty` returns
  `null` outside `DutyProvider` by design — the marketing tree and `/login`
  render shared chrome without one — and `DutyRow` renders nothing on `null`,
  so these tests need no provider and no mock for it. What they do need is the
  performance read the identity band's "jobs done" chip makes; unmocked it
  would add a background rejection to every synchronous assertion below.
*/
vi.mock("@/features/earnings/queries", () => ({
  usePartnerPerformance: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock("@/lib/api/browser", () => ({ getApiClient: vi.fn() }));
/*
  `MeHome` reads the profile now, to put the Partner's own name on the one
  screen that is about them. Mocked here rather than left to hit a stubbed API
  client: the tile assertions below are synchronous, and an unmocked query would
  add a background rejection to every one of them.
*/
vi.mock("@/features/profile/queries", () => ({
  usePartnerProfile: () => ({ data: undefined, isPending: true, isError: false }),
}));

import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { MeHome } from "./me-home";

/**
 * C2 — the Crew row no longer blames a Partner for a grant they never held.
 *
 * `WorkforceEngagementScreen`/`ProjectEngagementScreen`'s own registry rule
 * ("an item whose action is missing from the grant is not rendered — not
 * rendered disabled") applies here too: `/me/crew` is gated on
 * `WORKFORCE_WORKSPACE` + `crew.manage`, so the row that links there must be
 * gated the same way rather than dead-ending in a manufactured support call.
 *
 * The accessible name is "Your crew" rather than "Crew": the settings grid of
 * one-word tiles became a list of rows, each carrying a label and a line saying
 * what it does. Same gate, same destination, more words.
 */
function renderMeHome() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MeHome />
    </QueryClientProvider>,
  );
}

describe("MeHome's Crew row", () => {
  it("is hidden when the Partner holds no A3 crew.manage grant", () => {
    vi.mocked(usePartnerWorkspaceGrants).mockReturnValue({
      grants: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderMeHome();

    expect(screen.queryByRole("link", { name: /your crew/i })).not.toBeInTheDocument();
  });

  it("is shown when the Partner holds A3 crew.manage", () => {
    vi.mocked(usePartnerWorkspaceGrants).mockReturnValue({
      grants: [{ workspaceKey: "A3_TIME_BLOCK", commercialMode: "LEAD_ONLY", actions: ["crew.manage"] }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderMeHome();

    expect(screen.getByRole("link", { name: /your crew/i })).toBeInTheDocument();
  });
});
