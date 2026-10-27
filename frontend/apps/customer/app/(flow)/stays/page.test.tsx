import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "My Enquiries" is the signed-in guest's own list. Before sign-in there is
 * nothing of theirs to show, and the link used to open a page that only said
 * "Authentication credentials were not provided".
 */

const api = vi.hoisted(() => {
  let user: Record<string, unknown> | null = null;
  const ok = (data: unknown) =>
    Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });
  return {
    signIn: (next: Record<string, unknown> | null) => {
      user = next;
    },
    client: {
      GET: (path: string) =>
        path === "/api/v1/auth/session/"
          ? ok({ user, active_role: user ? "customer" : null })
          : ok([]),
      POST: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/stays",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: StaysBrowsePage } = await import("./page");

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <StaysBrowsePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.signIn(null);
});

describe("stays browse", () => {
  it("does not offer My Enquiries before sign-in", async () => {
    renderPage();

    await screen.findByRole("heading", { name: /find rooms, pg & hotels/i });
    await waitFor(() => expect(screen.queryByRole("link", { name: /my enquiries/i })).toBeNull());
  });

  it("offers My Enquiries once signed in", async () => {
    api.signIn({ id: "u-1", phone_number: "+919876543210", roles: ["customer"] });
    renderPage();

    expect(await screen.findByRole("link", { name: /my enquiries/i })).toHaveAttribute(
      "href",
      "/stays/mine",
    );
  });
});
