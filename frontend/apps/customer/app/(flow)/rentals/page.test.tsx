import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/rentals",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: RentalsBrowsePage } = await import("./page");

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RentalsBrowsePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.signIn(null);
});

describe("rentals browse", () => {
  it("renders All Equipment heading and hides My bookings before sign-in", async () => {
    renderPage();

    await screen.findByRole("heading", { level: 1, name: /all equipment/i });
    await waitFor(() => expect(screen.queryByRole("link", { name: /my bookings/i })).toBeNull());
  });

  it("offers My bookings once signed in, opened on rentals", async () => {
    api.signIn({ id: "u-1", phone_number: "+919876543210", roles: ["customer"] });
    renderPage();

    const links = await screen.findAllByRole("link", { name: /my bookings/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "/activity?type=rentals");
  });
});

