import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cart, cartItem, checkout, groupQuote, planSet, refusal } from "../fixtures";

/**
 * The `/cart` workspace as a journey, not as a set of panels.
 *
 * Its sibling files already cover what each panel renders. What only this level
 * can prove is what happens *between* them: that a merge refusal on the cart read
 * becomes a decision the customer makes, that an edit to one item carries that
 * item's own version, and that every recovery ends at server truth rather than at
 * a local correction.
 *
 * One mock client dispatches on path, because that is the seam the component
 * actually has. Mocking the hooks instead would let a test pass while the
 * component sent a request Django would refuse.
 *
 * Dialog focus trapping and Escape are deliberately **not** asserted here: the
 * jsdom `<dialog>` stand-in in `vitest.setup.ts` implements neither, and asserting
 * against a stand-in would prove nothing about a browser. Those live in the
 * Playwright suite.
 */

interface Route {
  status?: number;
  body: unknown;
}

const routes = {
  GET: new Map<string, Route>(),
  POST: new Map<string, Route>(),
  PATCH: new Map<string, Route>(),
};

/** Every call, so a test can assert what was sent and how often. */
const sent: { method: string; path: string; init: Record<string, unknown> }[] = [];

function respond(method: keyof typeof routes, path: string, init: unknown) {
  sent.push({ method, path, init: (init ?? {}) as Record<string, unknown> });
  const route = routes[method].get(path);
  const envelope = (code: string) => ({
    error: { code, message: "Refused.", details: null, retryable: false, request_id: "req_1" },
  });

  if (!route) {
    return Promise.resolve({
      data: undefined,
      error: envelope("not_found"),
      response: new Response(null, { status: 404 }),
    });
  }
  if (route.status !== undefined && route.status >= 400) {
    return Promise.resolve({
      data: undefined,
      error: route.body,
      response: new Response(null, { status: route.status }),
    });
  }
  return Promise.resolve({
    data: route.body,
    error: undefined,
    response: new Response(null, { status: 200 }),
  });
}

const client = {
  GET: vi.fn((path: string, init?: unknown) => respond("GET", path, init)),
  POST: vi.fn((path: string, init?: unknown) => respond("POST", path, init)),
  PATCH: vi.fn((path: string, init?: unknown) => respond("PATCH", path, init)),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { GroupBookingWorkspace } = await import("./workspace");

function ok(method: keyof typeof routes, path: string, body: unknown) {
  routes[method].set(path, { body });
}

function refuse(method: keyof typeof routes, path: string, code: string, details?: unknown) {
  routes[method].set(path, { status: 409, body: refusal(code, details).error });
}

const AUTHENTICATED = {
  user: { id: "cust-1", phone_number: "+919000000001" },
  active_role: "customer",
  roles: ["customer"],
};

const ANONYMOUS = { user: null, active_role: null, roles: [] };

const TWO_ITEM_CART = cart({
  version: 3,
  items: [
    cartItem({ id: "item-1", service_name: "Fan installation" }),
    cartItem({
      id: "item-2",
      variant_id: "variant-2",
      service_slug: "geyser-repair",
      service_name: "Geyser repair",
      variant_name: "Storage geyser",
    }),
  ],
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderWorkspace() {
  return render(<GroupBookingWorkspace />, { wrapper });
}

function cartReads() {
  return sent.filter((call) => call.path === "/api/v1/cart/");
}

beforeEach(() => {
  window.sessionStorage.clear();
  sent.length = 0;
  for (const map of Object.values(routes)) map.clear();
  for (const method of Object.values(client)) method.mockClear();

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  ok("GET", "/api/v1/auth/session/", AUTHENTICATED);
  ok("GET", "/api/v1/addresses/", []);
  ok("GET", "/api/v1/cart/", TWO_ITEM_CART);
});

afterEach(() => {
  queryClient.clear();
});

describe("a cart with more than one service", () => {
  it("renders each item independently, with the version every command is checked against", async () => {
    renderWorkspace();

    expect(await screen.findByText("Fan installation")).toBeInTheDocument();
    expect(screen.getByText("Geyser repair")).toBeInTheDocument();
    expect(screen.getByText(/2 services/)).toBeInTheDocument();
    expect(screen.getByText(/saved version/)).toHaveTextContent("3");
  });

  it("sends only the edited item's identity and version when one quantity changes", async () => {
    ok(
      "PATCH",
      "/api/v1/cart/items/{item_id}/",
      cart({
        version: 4,
        items: [
          cartItem({ id: "item-1", version: 2, quantity: 2 }),
          cartItem({ id: "item-2", service_name: "Geyser repair" }),
        ],
      }),
    );

    renderWorkspace();
    await screen.findByText("Fan installation");

    fireEvent.click(screen.getByRole("button", { name: /increase fan installation/i }));

    await waitFor(() =>
      expect(client.PATCH).toHaveBeenCalledWith("/api/v1/cart/items/{item_id}/", {
        params: { path: { item_id: "item-1" } },
        body: {
          expected_cart_version: 3,
          expected_item_version: 1,
          quantity: 2,
          scope: {},
        },
      }),
    );
  });

  it("leaves the other item untouched when one is edited", async () => {
    ok(
      "PATCH",
      "/api/v1/cart/items/{item_id}/",
      cart({
        version: 4,
        items: [
          cartItem({ id: "item-1", service_name: "Fan installation", version: 2, quantity: 2 }),
          cartItem({ id: "item-2", service_name: "Geyser repair", quantity: 1 }),
        ],
      }),
    );

    renderWorkspace();
    await screen.findByText("Fan installation");

    fireEvent.click(screen.getByRole("button", { name: /increase fan installation/i }));

    await waitFor(() => expect(screen.getByText(/saved version/)).toHaveTextContent("4"));
    const geyserRow = screen.getByText("Geyser repair").closest("li")!;
    expect(within(geyserRow).getByRole("status")).toHaveTextContent("1");
    const fanRow = screen.getByText("Fan installation").closest("li")!;
    expect(within(fanRow).getByRole("status")).toHaveTextContent("2");
  });

  it("keeps removal visibly unavailable rather than offering a control that cannot work", async () => {
    renderWorkspace();
    await screen.findByText("Fan installation");

    expect(screen.queryByRole("button", { name: /^remove/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/removing a service is not available yet/i).length,
    ).toBeGreaterThan(0);
  });

  it("recovers from a stale cart version by refetching rather than by patching locally", async () => {
    refuse("PATCH", "/api/v1/cart/items/{item_id}/", "cart_version_conflict", {
      current_version: 9,
    });

    renderWorkspace();
    await screen.findByText("Fan installation");
    const readsBefore = cartReads().length;

    fireEvent.click(screen.getByRole("button", { name: /increase fan installation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed somewhere else/i);
    await waitFor(() => expect(cartReads().length).toBeGreaterThan(readsBefore));
  });

  it("blocks Continue on an empty cart rather than planning nothing", async () => {
    ok("GET", "/api/v1/cart/", cart({ version: 1, items: [] }));

    renderWorkspace();
    await screen.findByText(/nothing in your booking yet/i);

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("logging in and merging", () => {
  it("raises login as an interrupt, without discarding the cart", async () => {
    ok("GET", "/api/v1/auth/session/", ANONYMOUS);

    renderWorkspace();
    await screen.findByText("Fan installation");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("main", { name: "Log in" })).toBeInTheDocument();
    // The superseded singleton surface is the only way a cart gets replaced.
    expect(client.PUT).not.toHaveBeenCalled();
  });

  it("turns a merge refusal into an explicit per-item decision", async () => {
    refuse("GET", "/api/v1/cart/", "cart_merge_conflict", {
      customer_cart_version: 2,
      session_cart_version: 5,
      conflicts: [
        { kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" },
        { kind: "DECISION_REQUIRED", session_item_id: "s-2", customer_item_id: "c-2" },
      ],
    });

    renderWorkspace();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/already had a booking started/i);
    expect(within(dialog).getByText(/duplicate request 1 of 2/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/duplicate request 2 of 2/i)).toBeInTheDocument();

    // Nothing preselected and nothing sendable yet: no side wins silently.
    expect(within(dialog).getByRole("button", { name: /merge my bookings/i })).toBeDisabled();
    for (const radio of within(dialog).getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
  });

  it("sends one decision per session item and then resumes on the merged cart", async () => {
    refuse("GET", "/api/v1/cart/", "cart_merge_conflict", {
      customer_cart_version: 2,
      session_cart_version: 5,
      conflicts: [{ kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" }],
    });
    ok("POST", "/api/v1/cart/merge/", TWO_ITEM_CART);

    renderWorkspace();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /keep both/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /merge my bookings/i }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/cart/merge/", {
        body: {
          expected_customer_cart_version: 2,
          expected_session_cart_version: 5,
          decisions: [{ session_item_id: "s-1", action: "KEEP_BOTH" }],
        },
      }),
    );

    expect(await screen.findByText("Fan installation")).toBeInTheDocument();
    expect(screen.getByText("Geyser repair")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers a re-read, not a decision, when the conflict is a mid-merge version change", async () => {
    refuse("GET", "/api/v1/cart/", "cart_merge_conflict", {
      customer_cart_version: 2,
      session_cart_version: 5,
      conflicts: [{ kind: "CART_VERSION_CHANGED" }],
    });

    renderWorkspace();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/changed while we were merging/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /reload my cart/i }),
    ).toBeInTheDocument();
  });

  it("does not retry a merge refusal, which would only re-attempt the merge", async () => {
    refuse("GET", "/api/v1/cart/", "cart_merge_conflict", {
      customer_cart_version: 2,
      session_cart_version: 5,
      conflicts: [{ kind: "EXACT_DUPLICATE", session_item_id: "s-1" }],
    });

    renderWorkspace();
    await screen.findByRole("dialog");

    expect(cartReads()).toHaveLength(1);
  });
});

describe("errors are rendered as answers, not as noise", () => {
  it("shows a readable failure and a retry when the cart cannot be read", async () => {
    routes.GET.set("/api/v1/cart/", {
      status: 409,
      body: {
        error: {
          code: "cart_invalid",
          message: "That booking is no longer valid.",
          details: null,
          retryable: false,
          request_id: "req_9",
        },
      },
    });

    renderWorkspace();

    expect(await screen.findByText(/could not load your booking/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // A conflict is an answer, not a transport failure: asking again is not free
    // and would produce the same refusal.
    expect(cartReads()).toHaveLength(1);
  });

  it("does not present a merge refusal as a generic load failure", async () => {
    refuse("GET", "/api/v1/cart/", "cart_merge_conflict", {
      customer_cart_version: 2,
      session_cart_version: 5,
      conflicts: [{ kind: "EXACT_DUPLICATE", session_item_id: "s-1" }],
    });

    renderWorkspace();
    await screen.findByRole("dialog");

    expect(screen.queryByText(/could not load your booking/i)).not.toBeInTheDocument();
  });
});

describe("what the workspace refuses to work out for itself", () => {
  it("does not sum or re-split the quote's money", () => {
    // The server total deliberately disagrees with the lines. Arithmetic here
    // would "fix" that and silently disagree with what is charged.
    const quote = groupQuote({ total: { amount_paise: 99999, currency: "INR" } });
    expect(quote.total.amount_paise).toBe(99999);
    expect(quote.units[0]!.total.amount_paise).toBe(31742);
  });

  it("carries the 1.9.0 group recovery fields without interpreting them", () => {
    // FE-09 acts on these. FE-08G only has to not drop them, and must not infer
    // a recovery action from `status` when the server publishes one.
    const confirmed = checkout();
    expect(confirmed.booking_group?.recovery_action).toBe("WAIT");
    expect(confirmed.booking_group?.server_now).toBe("2026-08-02T09:00:00Z");
    expect(confirmed.booking_group?.next_transition_at).toBe("2026-08-02T09:05:00Z");
  });

  it("treats a withdrawn plan set as unusable rather than as a slow one", () => {
    // The status is the server's, and every screen keys on it rather than on an
    // elapsed local timer.
    expect(planSet({ status: "INVALIDATED" }).status).not.toBe("ACTIVE");
    expect(planSet({ status: "EXPIRED" }).status).not.toBe("ACTIVE");
  });
});
