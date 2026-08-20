import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The header's session behaviour.
 *
 * Four properties, each of which fails silently: a private link must not be
 * offered to someone it would bounce, a resolving session must not claim the
 * customer is signed out, a failed session read must not become a login wall
 * over a perfectly usable catalog, and the notification bell must not be mounted
 * outside a session — mounting it is what starts a minute-long poll against an
 * `IsAuthenticated` endpoint, so mounting it for a visitor, or during the cold
 * load when the session has not resolved, is a poll into a refusal.
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
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const logout = vi.hoisted(() => ({
  mutate: vi.fn((_input: undefined, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.();
  }),
  isPending: false,
}));

vi.mock("../queries", () => ({ useCustomerSession: () => session.value }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => router,
}));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useLogout: () => logout,
}));

/**
 * The bell is stubbed, deliberately.
 *
 * What is under test here is the header's *mounting decision* — the bell polls
 * on mount, so where it is rendered is the question, not what it renders. A
 * stub also keeps this file from depending on the notification query layer,
 * which has its own tests. The marker is a `data-testid` rather than the real
 * accessible name so that a rename of the bell's own copy cannot make this file
 * quietly assert against a stub that no longer resembles it.
 */
vi.mock("@/features/notifications/view/notification-bell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
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

    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  it("offers activity and sign out once there is a session", () => {
    setSession({ isAuthenticated: true, isAnonymous: false, phoneNumber: "+919876500011" });

    render(<SiteHeader />, { wrapper });

    // The three private destinations became one. What is being asserted is not
    // the rename but the gate: `Activity` is only offered to someone it will
    // not bounce.
    expect(screen.getByRole("link", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open profile" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("replaces the current page with login after sign out succeeds", () => {
    setSession({ isAuthenticated: true, isAnonymous: false });
    render(<SiteHeader />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.refresh).toHaveBeenCalledOnce();
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
    // indication of where the customer is. Activity now owns that tree: the
    // record routes did not move when the nav item did, so `/bookings/…`,
    // `/requests/…`, `/projects` and `/engagements/…` all resolve to it.
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
  });

  it("marks Activity current from every record tree it now owns", () => {
    setSession({ isAuthenticated: true, isAnonymous: false });

    for (const pathname of [
      "/activity",
      "/requests/abc",
      "/requests/abc/quotes",
      "/projects",
      "/engagements/abc/receipt",
    ]) {
      route.pathname = pathname;
      const { unmount } = render(<SiteHeader />, { wrapper });
      expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      unmount();
    }
  });

  it("mounts the notification bell once there is a session", () => {
    setSession({ isAuthenticated: true, isAnonymous: false, phoneNumber: "+919876500011" });

    render(<SiteHeader />, { wrapper });

    expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
  });

  it("does not mount the bell for a signed-out visitor", () => {
    render(<SiteHeader />, { wrapper });

    // Mounting it starts a one-minute poll against an `IsAuthenticated`
    // endpoint. For a visitor that is a timer running into a 403 forever.
    expect(screen.queryByTestId("notification-bell")).not.toBeInTheDocument();
  });

  it("does not mount the bell while the session is still resolving", () => {
    setSession({ isResolving: true, isAnonymous: false });

    render(<SiteHeader />, { wrapper });

    // The same reason "Log in" is withheld here: on a cold load the answer is
    // not known yet, and the bell would ask a question that needs it.
    expect(screen.queryByTestId("notification-bell")).not.toBeInTheDocument();
  });

  it("does not mount the bell when the session read failed", () => {
    setSession({ isAuthenticated: false, isAnonymous: false, isUnavailable: true });

    render(<SiteHeader />, { wrapper });

    // `isUnavailable` is treated as signed-out for navigation, and the bell is
    // navigation-adjacent: the links stay usable, but nothing starts polling a
    // private endpoint off the back of a failed session read.
    expect(screen.queryByTestId("notification-bell")).not.toBeInTheDocument();
  });

  it("does not mark a sibling whose href is a string prefix", () => {
    route.pathname = "/catalogue-of-something";

    render(<SiteHeader />, { wrapper });

    // `/catalog` must not match `/catalogue…`. The boundary slash is what makes
    // `startsWith` safe here.
    expect(screen.getByRole("link", { name: "Services" })).not.toHaveAttribute("aria-current");
  });
});
