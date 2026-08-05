import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkout, ok, refusal } from "@/features/shared/fixtures";

/**
 * Starting a checkout for a Customer who is not at the keyboard.
 *
 * This is the most consequential command in the console — it commits somebody
 * else to a purchase — and there is no published command that reverses it. The
 * tests below are the four things that keep that honest:
 *
 *  - Nothing is sent until a second, differently worded press. Typing an id and
 *    committing someone to a purchase are separate decisions.
 *  - Consent is named by the operator and never defaulted. A prefilled purpose
 *    would be the console asserting a consent nobody took, on the record that
 *    exists specifically to prove one was.
 *  - One idempotency key per Customer-and-quote, reused across attempts. A
 *    double-click or a lost response must replay the first outcome, not create
 *    a second checkout against one quote.
 *  - `idempotency_in_progress` is never dressed up as a failure. The outcome is
 *    unknown, and telling an operator to try again is how a second checkout
 *    gets made by hand.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { AssistedCheckoutForm } = await import("./assisted-checkout-form");

const CUSTOMER_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const QUOTE_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function field(label: RegExp) {
  return screen.getByLabelText(label);
}

/** Fills a valid form without pressing anything. */
function fillValidly(overrides: Partial<Record<"customer" | "quote" | "purpose" | "version", string>> = {}) {
  fireEvent.change(field(/customer id/i), {
    target: { value: overrides.customer ?? CUSTOMER_ID },
  });
  fireEvent.change(field(/quote id/i), { target: { value: overrides.quote ?? QUOTE_ID } });
  fireEvent.change(field(/consent purpose/i), {
    target: { value: overrides.purpose ?? "assisted-booking" },
  });
  fireEvent.change(field(/consent document version/i), {
    target: { value: overrides.version ?? "2026-07" },
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("consent is named, never defaulted", () => {
  it("opens with both consent fields empty", () => {
    render(<AssistedCheckoutForm />, { wrapper });

    expect(field(/consent purpose/i)).toHaveValue("");
    expect(field(/consent document version/i)).toHaveValue("");
  });

  it("will not reach the confirmation without a recorded consent", () => {
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly({ purpose: "" });

    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));

    expect(screen.getByText(/exactly as it is recorded/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start checkout for this customer/i }),
    ).not.toBeInTheDocument();
  });

  it("sends the consent the operator typed, verbatim", async () => {
    client.POST.mockResolvedValue(ok(checkout(), 201));
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly({ purpose: "assisted-booking", version: "terms-2026-07" });

    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![1].body).toEqual({
      customer_id: CUSTOMER_ID,
      quote_id: QUOTE_ID,
      consent_purpose: "assisted-booking",
      consent_version: "terms-2026-07",
    });
  });
});

describe("confirm before, because there is no undo after", () => {
  it("sends nothing on the first press", () => {
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();

    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/confirm before you commit them/i)).toBeInTheDocument();
  });

  it("says plainly that this console cannot undo it", () => {
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));

    expect(screen.getByText(/no command in this console that undoes it/i)).toBeInTheDocument();
  });

  it("quotes the ids back masked, not in full", () => {
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));

    // Enough to recognise the record you just typed; not enough to be a useful
    // thing to photograph.
    expect(screen.getByText(`…${CUSTOMER_ID.slice(-12)}`)).toBeInTheDocument();
    expect(screen.queryByText(CUSTOMER_ID)).not.toBeInTheDocument();
  });

  it("drops back out of the confirmation when the details are edited", () => {
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));

    fireEvent.change(field(/quote id/i), { target: { value: "cccccccc-3333-4333-8333-cccccccccccc" } });

    // The read-back described the old quote. Leaving it up next to a new input
    // is how the wrong purchase gets confirmed.
    expect(
      screen.queryByRole("button", { name: /start checkout for this customer/i }),
    ).not.toBeInTheDocument();
  });
});

describe("one key per Customer and quote", () => {
  it("reuses the same key when the command is sent twice", async () => {
    client.POST.mockResolvedValue(ok(checkout(), 201));
    const { unmount } = render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));

    // A refresh mid-request is the case this protects: the operator comes back
    // and presses again, and the server must replay rather than create.
    unmount();
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    const first = client.POST.mock.calls[0]![1].params.header["Idempotency-Key"];
    const second = client.POST.mock.calls[1]![1].params.header["Idempotency-Key"];
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("mints a different key for a different quote", async () => {
    client.POST.mockResolvedValue(ok(checkout(), 201));
    render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));

    fillValidly({ quote: "cccccccc-3333-4333-8333-cccccccccccc" });
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).not.toBe(
      client.POST.mock.calls[0]![1].params.header["Idempotency-Key"],
    );
  });
});

describe("refusals", () => {
  it("tells the operator to wait, not to retry, while a command is in flight", async () => {
    client.POST.mockResolvedValue(refusal("idempotency_in_progress", 409));
    render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));

    expect(await screen.findByText(/still being processed/i)).toBeInTheDocument();
    expect(screen.getByText(/do not start a second one/i)).toBeInTheDocument();
  });

  it("separates an unknown Customer from a reused key", async () => {
    client.POST.mockResolvedValue(refusal("not_found", 404));
    const view = render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    expect(await screen.findByText(/could not find that Customer or quote/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was created/i)).toBeInTheDocument();
    view.unmount();

    client.POST.mockResolvedValue(refusal("idempotency_key_reused", 409));
    render(<AssistedCheckoutForm />, { wrapper });
    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));

    expect(await screen.findByText(/do not match the earlier attempt/i)).toBeInTheDocument();
    // The recovery is to look at what already exists, not to send it again.
    expect(screen.getByText(/rather than sending this again/i)).toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    client.POST.mockResolvedValue(refusal("idempotency_in_progress", 409));
    render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await screen.findByText(/still being processed/i);

    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("what the operator is told afterwards", () => {
  it("shows the checkout and sends the Customer to pay for it themselves", async () => {
    client.POST.mockResolvedValue(ok(checkout(), 201));
    render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));

    expect(await screen.findByText(/checkout for this quote/i)).toBeInTheDocument();
    expect(screen.getByText(/pays from their own account/i)).toBeInTheDocument();
    expect(screen.getByText(/does not take payment on their behalf/i)).toBeInTheDocument();
  });

  it("does not claim whether the checkout was created or replayed", async () => {
    // Django sets `Idempotent-Replay`, but `CORS_EXPOSE_HEADERS` publishes
    // `Date` alone, so a browser on this origin reads null on every call.
    // Asserting "created" would be a fabricated claim about somebody's money.
    client.POST.mockResolvedValue(ok(checkout(), 200));
    const { container } = render(<AssistedCheckoutForm />, { wrapper });

    fillValidly();
    fireEvent.click(screen.getByRole("button", { name: /review this checkout/i }));
    fireEvent.click(screen.getByRole("button", { name: /start checkout for this customer/i }));
    await screen.findByText(/checkout for this quote/i);

    expect(container.textContent ?? "").not.toMatch(/newly created|already existed|replay/i);
  });
});
