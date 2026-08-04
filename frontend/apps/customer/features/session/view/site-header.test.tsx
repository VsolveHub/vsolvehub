import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The header's session behaviour.
 *
 * Three properties, each of which fails silently: a private link must not be
 * offered to someone it would bounce, a resolving session must not claim the
 * customer is signed out, and a failed session read must not become a login
 * wall over a perfectly usable catalog.
 */

const session = vi.hoisted(() => ({
  value: {
    isResolving: false,
    isAuthenticated: false,
    isAnonymous: true,
    isUnavailable: false,
    phoneNumber: null as string | null,
    activeRole: null as string | null,
    refetch: vi.fn(),
  },
}));

const route = vi.hoisted(() => ({ pathname: "/catalog" }));

vi.mock("../queries", () => ({ useCustomerSession: () => session.value }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { SiteHeader } = await import("./site-header");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function setSession(overrides: Partial<typeof session.value>) {
  session.value = { ...session.value, ...overrides };
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  route.pathname = "/catalog";
  setSession({
    isResolving: false,
    isAuthenticated: false,
    isAnonymous: true,
    isUnavailable: false,
    phoneNumber: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe("SiteHeader", () => {
  it("always offers the public surfaces, including the anonymous basket", () => {
    render(<SiteHeader />, { wrapper });

    expect(screen.getByRole("link", { name: "Services" })).toBeInTheDocument();
    // The anonymous cart is a real product surface. Hiding it from a visitor who
    // has already put something in it would be absurd.
    expect(screen.getByRole("link", { name: "Basket" })).toBeInTheDocument();
  });

  it("does not offer a signed-out visitor a link that would bounce them", () => {
    render(<SiteHeader />, { wrapper });

    expect(screen.queryByRole("link", { name: "My bookings" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  it("offers bookings and sign out once there is a session", () => {
    setSession({ isAuthenticated: true, isAnonymous: false, phoneNumber: "+919876500011" });

    render(<SiteHeader />, { wrapper });

    expect(screen.getByRole("link", { name: "My bookings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("claims nothing while the session is still resolving", () => {
    setSession({ isResolving: true, isAnonymous: false });

    render(<SiteHeader />, { wrapper });

    // The flicker regression: showing "Log in" here tells a signed-in customer
    // they are signed out on every cold load, then swaps it back.
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("keeps the catalog usable when the session read fails", () => {
    setSession({ isAuthenticated: false, isAnonymous: false, isUnavailable: true });

    render(<SiteHeader />, { wrapper });

    // A failed request is not a logout. The links still work and Django still
    // refuses what it should; nobody gets a login wall because of a blip.
    expect(screen.getByRole("link", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  it("marks the current section from a nested route", () => {
    setSession({ isAuthenticated: true, isAnonymous: false });
    route.pathname = "/bookings/abc/pay";

    render(<SiteHeader />, { wrapper });

    // An exact match would leave the entire payment and receipt tree with no
    // indication of where the customer is.
    expect(screen.getByRole("link", { name: "My bookings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark a sibling whose href is a string prefix", () => {
    route.pathname = "/catalogue-of-something";

    render(<SiteHeader />, { wrapper });

    // `/catalog` must not match `/catalogue…`. The boundary slash is what makes
    // `startsWith` safe here.
    expect(screen.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
  });
});
