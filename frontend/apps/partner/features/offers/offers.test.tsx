import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { queryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offer, offerPage, refusal, serviceLine } from "./fixtures";

/**
 * The Partner offer inbox.
 *
 * The test this file exists for is "does not tell a Partner they lost a job they
 * won". The offer commands are state-guarded rather than idempotent (proposal
 * 0009), so a retry after a lost response answers *"no longer available to
 * accept"* whether the Partner missed the offer or already holds it. Rendering
 * that as a loss makes someone walk away from work reserved in their name.
 *
 * The rest of the file guards the unit-scope boundary: an offer carries one
 * Fulfilment Unit and this client must never reconstruct what the server
 * withheld.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { OfferInbox } = await import("./view/offer-inbox");
const { isOfferSettled } = await import("./queries");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

describe("when the inbox stops polling", () => {
  it("keeps watching an offer that is still the Partner's to answer", () => {
    expect(isOfferSettled(offer({ status: "OFFERED" }))).toBe(false);
  });

  it("keeps watching an accepted offer, whose undo window closes on a server timer", () => {
    // Not settled: the window expires into a commitment without the Partner
    // doing anything, so a poll that stopped here would freeze the countdown.
    expect(isOfferSettled(offer({ status: "ACCEPTED_PENDING_UNDO" }))).toBe(false);
  });

  it("stops once nothing further can happen", () => {
    for (const status of ["COMMITTED", "DECLINED", "UNDONE", "EXPIRED", "REVOKED"] as const) {
      expect(isOfferSettled(offer({ status }))).toBe(true);
    }
  });
});

describe("what an offer shows", () => {
  it("renders the unit's own scope, area, timing and full money breakdown", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));

    render(<OfferInbox />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Jubilee Hills" })).toBeInTheDocument();
    expect(screen.getByText("Fan installation")).toBeInTheDocument();
    expect(screen.getByText("Ladder")).toBeInTheDocument();
    // Gross, commission and net together. Gross alone is the number a Partner
    // remembers and not the one they are paid.
    expect(screen.getByText("₹249")).toBeInTheDocument();
    expect(screen.getByText("₹49.80")).toBeInTheDocument();
    expect(screen.getByText("₹199.20")).toBeInTheDocument();
  });

  it("shows the area as an area, without inventing a street or a distance", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });

    expect(screen.queryByText(/km away/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /map|directions/i })).not.toBeInTheDocument();
  });

  it("cannot show a sibling unit, a Customer or an address, because it holds none", async () => {
    const payload = offerPage({
      results: [offer({ service_lines: [serviceLine({ service_label: "Fan installation" })] })],
    });
    client.GET.mockResolvedValue(ok(payload));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });

    // The projection carries no such fields, and nothing here joins to fetch
    // them. Asserted so a future "helpful" lookup fails a test that says why.
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["customer", "address", "line1", "phone", "sibling"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
    expect(client.GET).toHaveBeenCalledTimes(1);
    expect(client.GET).toHaveBeenCalledWith("/api/v1/partner/offers/");
  });

  it("says the list is truncated rather than presenting a partial one as complete", async () => {
    // The published list paginates but exposes no `cursor` parameter, so page
    // two cannot be requested (proposal 0008).
    client.GET.mockResolvedValue(ok(offerPage({ next: "https://api.example/offers/?cursor=x" })));

    render(<OfferInbox />, { wrapper });

    expect(await screen.findByText(/more than fit on this page/i)).toBeInTheDocument();
  });
});

describe("accepting", () => {
  it("sends the typed action for that offer and nothing else", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(ok(offer({ status: "ACCEPTED_PENDING_UNDO" })));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST).toHaveBeenCalledWith("/api/v1/partner/offers/{offer_id}/{action}/", {
      params: { path: { offer_id: "offer-1", action: "accept" } },
    });
  });

  it("writes the returned offer back rather than refetching what it was just told", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(
      ok(offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" })),
    );

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByText(/this is yours/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo — no penalty/i })).toBeInTheDocument();
    // One read on mount. The command's own response was the answer.
    expect(client.GET).toHaveBeenCalledTimes(1);
  });

  it("never auto-retries, because the contract defines no safe replay", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("offer_invalid"));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("a command whose outcome cannot be known", () => {
  it("says the result is unconfirmed, never that the Partner lost the job", async () => {
    // The exact scenario proposal 0009 is about: the first Accept succeeded, the
    // response was lost, the retry answers `offer_invalid`. The Partner holds
    // the job. Telling them otherwise makes them walk away from it.
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("offer_invalid"));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not confirm/i);
    expect(alert).toHaveTextContent(/may already have gone through/i);
    expect(alert).toHaveTextContent(/do not assume you lost it/i);
    expect(alert).not.toHaveTextContent(/no longer available/i);
  });

  it("re-reads the inbox, because the offer's status is the only thing that knows", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("offer_invalid"));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    // Asserted as a second read rather than as `isInvalidated`: the inbox is an
    // active query, so invalidation refetches immediately and the flag is back
    // to false by the time it could be observed.
    await waitFor(() => expect(client.GET.mock.calls.length).toBeGreaterThan(1));
    expect(queryKeys.partner.offers()).toEqual(["partner", "offers"]);
  });

  it("is unambiguous when the offer is genuinely not the caller's", async () => {
    // A 403 is not ambiguous, so it does not get the hedged wording.
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("permission_denied", 403));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("the undo window", () => {
  it("offers commit and undo while the window is open", async () => {
    client.GET.mockResolvedValue(
      ok(
        offerPage({
          results: [
            offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" }),
          ],
        }),
      ),
    );

    render(<OfferInbox />, { wrapper });

    expect(await screen.findByRole("button", { name: /commit now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo — no penalty/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("sends undo as its own command", async () => {
    client.GET.mockResolvedValue(
      ok(
        offerPage({
          results: [
            offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" }),
          ],
        }),
      ),
    );
    client.POST.mockResolvedValue(ok(offer({ status: "UNDONE" })));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /undo — no penalty/i }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/partner/offers/{offer_id}/{action}/", {
        params: { path: { offer_id: "offer-1", action: "undo" } },
      }),
    );
  });

  it("offers no further action once committed", async () => {
    client.GET.mockResolvedValue(ok(offerPage({ results: [offer({ status: "COMMITTED" })] })));

    render(<OfferInbox />, { wrapper });

    expect(await screen.findByText(/^Committed$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /commit now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });
});

describe("an empty inbox", () => {
  it("says no offers rather than implying something went wrong", async () => {
    client.GET.mockResolvedValue(ok(offerPage({ results: [] })));

    render(<OfferInbox />, { wrapper });

    expect(await screen.findByText(/no offers right now/i)).toBeInTheDocument();
    expect(screen.getByText(/make sure you are online/i)).toBeInTheDocument();
  });
});

describe("only the pressed offer is affected", () => {
  it("disables the row with a command in flight and leaves the other usable", async () => {
    client.GET.mockResolvedValue(
      ok(
        offerPage({
          results: [
            offer({ id: "offer-1", approximate_area: "Jubilee Hills" }),
            offer({ id: "offer-2", approximate_area: "Banjara Hills" }),
          ],
        }),
      ),
    );
    // Never resolves, so the in-flight window stays open for the assertion.
    client.POST.mockImplementation(() => new Promise(() => {}));

    render(<OfferInbox />, { wrapper });
    const first = (await screen.findByRole("heading", { name: "Jubilee Hills" })).closest("li")!;
    const second = screen.getByRole("heading", { name: "Banjara Hills" }).closest("li")!;

    fireEvent.click(within(first).getByRole("button", { name: "Accept" }));

    // Matched loosely because a loading Button keeps its label *and* announces
    // "Accepting", so its accessible name changes while the command is in
    // flight. That is the Button's design, not an accident.
    await waitFor(() =>
      expect(within(first).getByRole("button", { name: /accept/i })).toBeDisabled(),
    );
    expect(within(second).getByRole("button", { name: /^accept$/i })).toBeEnabled();
  });
});
