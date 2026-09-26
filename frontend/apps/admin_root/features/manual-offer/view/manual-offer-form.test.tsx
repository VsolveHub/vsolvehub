import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offer, ok, refusal } from "@/features/shared/fixtures";

/**
 * Offering work to a named Partner — the re-offer path.
 *
 * The word that matters on this screen is "offer". Operations offers; the
 * Partner decides. "Offer to Partner" reads very easily as "assign to Partner",
 * and those are different promises to make to a Customer waiting on the phone —
 * so the copy is asserted here, not just the request.
 *
 * The second property is that the console renders the server's own projection
 * and enriches none of it. The projection withholds the exact address on
 * purpose; reconstructing it here would undo a privacy decision made upstream.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ManualOfferForm } = await import("./manual-offer-form");

const CHECKOUT_ID = "dddddddd-1111-4111-8111-dddddddddddd";
const UNIT_ID = "eeeeeeee-2222-4222-8222-eeeeeeeeeeee";
const PARTNER_ID = "ffffffff-3333-4333-8333-ffffffffffff";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function send(target: "checkout" | "fulfilment-unit", targetId: string) {
  if (target === "fulfilment-unit") {
    fireEvent.click(screen.getByRole("radio", { name: /one fulfilment unit/i }));
  }
  fireEvent.change(
    screen.getByLabelText(target === "checkout" ? /checkout id/i : /fulfilment unit id/i),
    { target: { value: targetId } },
  );
  fireEvent.change(screen.getByLabelText(/partner id/i), { target: { value: PARTNER_ID } });
  fireEvent.click(screen.getByRole("button", { name: /send offer/i }));
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

describe("the target decides the endpoint, not a second decision", () => {
  it("offers a whole checkout", async () => {
    client.POST.mockResolvedValue(ok(offer(), 201));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/checkouts/{checkout_id}/offers/");
    expect(init.params.path).toEqual({ checkout_id: CHECKOUT_ID });
    expect(init.body).toEqual({ partner_id: PARTNER_ID });
  });

  it("offers a single visit", async () => {
    client.POST.mockResolvedValue(
      ok(offer({ checkout_id: null, fulfilment_unit_id: UNIT_ID, unit_position: 1 }), 201),
    );
    render(<ManualOfferForm />, { wrapper });

    send("fulfilment-unit", UNIT_ID);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/fulfilment-units/{unit_id}/offers/");
    expect(init.params.path).toEqual({ unit_id: UNIT_ID });
  });

  it("sends no idempotency key, because neither endpoint publishes one", async () => {
    // A key the server does not read is a comfort, not a guarantee. The real
    // protection is that the command is never retried automatically.
    client.POST.mockResolvedValue(ok(offer(), 201));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![1].params?.header).toBeUndefined();
  });
});

describe("nothing is sent on a mistyped id", () => {
  it("refuses to spend a request on an id that is not a UUID", () => {
    render(<ManualOfferForm />, { wrapper });

    fireEvent.change(screen.getByLabelText(/checkout id/i), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText(/partner id/i), { target: { value: PARTNER_ID } });
    fireEvent.click(screen.getByRole("button", { name: /send offer/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/paste the checkout id/i)).toBeInTheDocument();
  });

  it("names the field the operator is actually looking at", () => {
    render(<ManualOfferForm />, { wrapper });

    fireEvent.click(screen.getByRole("radio", { name: /one fulfilment unit/i }));
    fireEvent.click(screen.getByRole("button", { name: /send offer/i }));

    expect(screen.getByText(/paste the fulfilment unit id/i)).toBeInTheDocument();
  });
});

describe("an offer is made, not accepted", () => {
  it("never says the work is assigned", async () => {
    client.POST.mockResolvedValue(ok(offer(), 201));
    const { container } = render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/offer sent/i);

    const text = container.textContent ?? "";
    expect(text).toMatch(/this is not an assignment yet/i);
    expect(text).not.toMatch(/\bassigned to\b|\bbooked\b/i);
  });

  it("says the Partner may decline or let it lapse", async () => {
    client.POST.mockResolvedValue(ok(offer(), 201));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);

    expect(await screen.findByText(/decline, or let it lapse/i)).toBeInTheDocument();
  });
});

describe("the result is the server's projection, unenriched", () => {
  it("shows the approximate area and never a street address", async () => {
    client.POST.mockResolvedValue(ok(offer({ approximate_area: "Gachibowli" }), 201));
    const { container } = render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/offer sent/i);

    expect(container.textContent ?? "").toContain("Gachibowli");
  });

  it("shows the Partner's earnings only when the server sent them", async () => {
    client.POST.mockResolvedValue(ok(offer({ estimated_net: null }), 201));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/offer sent/i);

    expect(screen.queryByText(/partner earns/i)).not.toBeInTheDocument();
  });

  it("masks the offer reference", async () => {
    client.POST.mockResolvedValue(ok(offer(), 201));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/offer sent/i);

    expect(screen.getByText(`…${offer().id.slice(-12)}`)).toBeInTheDocument();
  });
});

describe("refusals", () => {
  it("separates work that cannot be offered from ids that do not exist", async () => {
    client.POST.mockResolvedValue(refusal("offer_not_allowed", 409));
    const view = render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    expect(await screen.findByText(/cannot be offered right now/i)).toBeInTheDocument();
    expect(screen.getByText(/no offer was sent/i)).toBeInTheDocument();
    view.unmount();

    client.POST.mockResolvedValue(refusal("not_found", 404));
    render(<ManualOfferForm />, { wrapper });
    send("checkout", CHECKOUT_ID);

    expect(await screen.findByText(/could not find that work or Partner/i)).toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    // A retried offer is a second offer on the same work, and the Partner sees
    // both.
    client.POST.mockResolvedValue(refusal("offer_not_allowed", 409));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/cannot be offered right now/i);

    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("clears a stale outcome when the ids are edited", async () => {
    client.POST.mockResolvedValue(refusal("not_found", 404));
    render(<ManualOfferForm />, { wrapper });

    send("checkout", CHECKOUT_ID);
    await screen.findByText(/could not find that work or Partner/i);

    fireEvent.change(screen.getByLabelText(/checkout id/i), {
      target: { value: "11111111-9999-4999-8999-111111111111" },
    });

    expect(screen.queryByText(/could not find that work or Partner/i)).not.toBeInTheDocument();
  });
});
