import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { queryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offer, offerPage, refusal, serviceLine } from "./fixtures";

/**
 * The Partner offer inbox.
 *
 * The test this file exists for is "does not tell a Partner they lost a job they
 * won". Offer commands are idempotent under a stable key (proposal 0009); a lost
 * Accept response must keep that key so an explicit replay returns the held
 * offer rather than inventing a second attempt.
 *
 * The rest of the file guards the unit-scope boundary: an offer carries one
 * Fulfilment Unit and this client must never reconstruct what the server
 * withheld.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { OfferInbox } = await import("./view/offer-inbox");
const { isOfferSettled, isTraversingHistory, offerCommandIntentKey } = await import("./queries");

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
    expect(client.GET).toHaveBeenCalledWith("/api/v1/partner/offers/", {
      params: { query: {} },
    });
  });

  it("loads further pages through the opaque cursor without discarding page one", async () => {
    const pageOne = offerPage({
      next: "https://api.example/api/v1/partner/offers/?cursor=opaque-2",
      results: [offer({ id: "offer-1", approximate_area: "Jubilee Hills" })],
    });
    const pageTwo = offerPage({
      next: null,
      results: [offer({ id: "offer-2", approximate_area: "Banjara Hills" })],
    });
    client.GET.mockResolvedValueOnce(ok(pageOne)).mockResolvedValueOnce(ok(pageTwo));

    render(<OfferInbox />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Jubilee Hills" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("heading", { name: "Banjara Hills" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jubilee Hills" })).toBeInTheDocument();
    expect(client.GET).toHaveBeenNthCalledWith(2, "/api/v1/partner/offers/", {
      params: { query: { cursor: "opaque-2" } },
    });
  });
});

describe("accepting", () => {
  it("sends the typed action under a stable Idempotency-Key", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(ok(offer({ status: "ACCEPTED_PENDING_UNDO" })));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST).toHaveBeenCalledWith("/api/v1/partner/offers/{offer_id}/{action}/", {
      params: {
        path: { offer_id: "offer-1", action: "accept" },
        header: {
          "Idempotency-Key": offerCommandIntentKey({ offerId: "offer-1", action: "accept" }),
        },
      },
    });
  });

  it("reuses the same key for the same offer action across retries", () => {
    expect(offerCommandIntentKey({ offerId: "offer-1", action: "accept" })).toBe(
      offerCommandIntentKey({ offerId: "offer-1", action: "accept" }),
    );
    expect(offerCommandIntentKey({ offerId: "offer-1", action: "accept" })).not.toBe(
      offerCommandIntentKey({ offerId: "offer-1", action: "decline" }),
    );
    expect(offerCommandIntentKey({ offerId: "offer-1", action: "accept" })).not.toBe(
      offerCommandIntentKey({ offerId: "offer-2", action: "accept" }),
    );
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

  it("never auto-retries a refused command", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("offer_invalid"));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("keeps the same key after a lost response so an explicit replay is safe", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockRejectedValueOnce(new Error("network"));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    const firstKey = client.POST.mock.calls[0]![1].params.header["Idempotency-Key"];
    client.POST.mockResolvedValue(
      ok(offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));
    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).toBe(firstKey);
    expect(await screen.findByText(/this is yours/i)).toBeInTheDocument();
  });

  it("does not present a reservation conflict as success", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("offer_reservation_conflict", 409));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/another professional already holds/i);
    expect(alert).not.toHaveTextContent(/this is yours/i);
  });

  it("does not present an idempotency key-reuse conflict as success", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("idempotency_key_reused", 409));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be replayed safely/i);
  });

  it("keeps idempotency_in_progress recoverable rather than as a lost offer", async () => {
    client.GET.mockResolvedValue(ok(offerPage()));
    client.POST.mockResolvedValue(refusal("idempotency_in_progress", 409));

    render(<OfferInbox />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/still being processed/i);
    expect(alert).not.toHaveTextContent(/lost/i);
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
        params: {
          path: { offer_id: "offer-1", action: "undo" },
          header: {
            "Idempotency-Key": offerCommandIntentKey({ offerId: "offer-1", action: "undo" }),
          },
        },
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
  /** Re-queried on every use: the inbox re-renders under the assertions. */
  function row(area: string) {
    return within(screen.getByRole("heading", { name: area }).closest("li")!);
  }

  const TWO_OFFERS = offerPage({
    results: [
      offer({ id: "offer-1", approximate_area: "Jubilee Hills" }),
      offer({ id: "offer-2", approximate_area: "Banjara Hills" }),
    ],
  });

  it("disables the row with a command in flight and leaves the other usable", async () => {
    client.GET.mockResolvedValue(ok(TWO_OFFERS));
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

  it("keeps a second command from re-enabling the first one's buttons", async () => {
    // Under one shared mutation this is the double-accept path: pressing Accept
    // on B reset the inbox's single `pendingOfferId`, so A's Accept button came
    // back to life with A's command still in flight. A Partner pressing it again
    // sends a second request under the same idempotency key — safe by contract,
    // but the button should never have offered it.
    client.GET.mockResolvedValue(ok(TWO_OFFERS));
    client.POST.mockImplementation(() => new Promise(() => {}));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });

    fireEvent.click(row("Jubilee Hills").getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(row("Jubilee Hills").getByRole("button", { name: /accept/i })).toBeDisabled(),
    );

    fireEvent.click(row("Banjara Hills").getByRole("button", { name: /^accept$/i }));

    await waitFor(() =>
      expect(row("Banjara Hills").getByRole("button", { name: /accept/i })).toBeDisabled(),
    );
    // The one that matters: A is still running, so A is still busy.
    expect(row("Jubilee Hills").getByRole("button", { name: /accept/i })).toBeDisabled();
  });

  it("reports a failure on the row that failed, and only that row", async () => {
    client.GET.mockResolvedValue(ok(TWO_OFFERS));
    client.POST
      // A never settles.
      .mockImplementationOnce(() => new Promise(() => {}))
      // B is refused while A is still in flight.
      .mockImplementationOnce(() => Promise.resolve(refusal("offer_reservation_conflict", 409)));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });

    fireEvent.click(row("Jubilee Hills").getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(row("Jubilee Hills").getByRole("button", { name: /accept/i })).toBeDisabled(),
    );
    fireEvent.click(row("Banjara Hills").getByRole("button", { name: /^accept$/i }));

    await waitFor(() =>
      expect(row("Banjara Hills").getByRole("alert")).toHaveTextContent(
        /another professional already holds/i,
      ),
    );
    // A shared mutation would have painted B's refusal onto whichever row the
    // shared `unconfirmedOfferId` happened to hold. A has not answered at all.
    expect(row("Jubilee Hills").queryByRole("alert")).not.toBeInTheDocument();
    expect(row("Jubilee Hills").getByRole("button", { name: /accept/i })).toBeDisabled();
  });
});

describe("live updates while the Partner reads back through older offers", () => {
  const PAGE_ONE = offerPage({
    next: "https://api.example/api/v1/partner/offers/?cursor=opaque-2",
    results: [offer({ id: "offer-1", approximate_area: "Jubilee Hills" })],
  });
  const PAGE_TWO = offerPage({
    next: null,
    results: [offer({ id: "offer-2", approximate_area: "Banjara Hills" })],
  });

  it("knows page one from a traversal", () => {
    expect(isTraversingHistory({ pages: [PAGE_ONE], pageParams: [""] })).toBe(false);
    expect(
      isTraversingHistory({ pages: [PAGE_ONE, PAGE_TWO], pageParams: ["", "opaque-2"] }),
    ).toBe(true);
  });

  it("does not re-walk every loaded page on the five-second poll", async () => {
    // The acceptance condition. TanStack refetches *all* retained pages of an
    // infinite query, so a five-second interval over a two-page traversal is a
    // sequential cursor read of the whole list every five seconds.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      client.GET.mockResolvedValueOnce(ok(PAGE_ONE)).mockResolvedValueOnce(ok(PAGE_TWO));

      render(<OfferInbox />, { wrapper });
      await screen.findByRole("heading", { name: "Jubilee Hills" });

      client.GET.mockResolvedValue(ok(PAGE_TWO));
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await screen.findByRole("heading", { name: "Banjara Hills" });

      const settled = client.GET.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(client.GET.mock.calls.length).toBe(settled);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still polls while the Partner is on the newest page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      client.GET.mockResolvedValue(ok(PAGE_ONE));

      render(<OfferInbox />, { wrapper });
      await screen.findByRole("heading", { name: "Jubilee Hills" });

      const initial = client.GET.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(client.GET.mock.calls.length).toBeGreaterThan(initial);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says live updates are paused rather than letting them look current", async () => {
    client.GET.mockResolvedValueOnce(ok(PAGE_ONE)).mockResolvedValueOnce(ok(PAGE_TWO));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });
    expect(screen.getByText(/new offers appear here automatically/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Banjara Hills" });

    expect(await screen.findByText(/live updates are paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to the latest offers" })).toBeInTheDocument();
  });

  it("resumes from the newest page when the Partner goes back to it", async () => {
    client.GET.mockResolvedValueOnce(ok(PAGE_ONE)).mockResolvedValueOnce(ok(PAGE_TWO));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Banjara Hills" });

    client.GET.mockResolvedValue(ok(PAGE_ONE));
    fireEvent.click(screen.getByRole("button", { name: "Back to the latest offers" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Banjara Hills" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/new offers appear here automatically/i)).toBeInTheDocument();
  });
});

describe("overlapping list operations", () => {
  it("will not refresh while a page traversal is in flight", async () => {
    const pageOne = offerPage({
      next: "https://api.example/api/v1/partner/offers/?cursor=opaque-2",
      results: [offer({ id: "offer-1", approximate_area: "Jubilee Hills" })],
    });
    client.GET
      .mockResolvedValueOnce(ok(pageOne))
      // Never settles, so the traversal stays open for the assertion.
      .mockImplementation(() => new Promise(() => {}));

    render(<OfferInbox />, { wrapper });
    await screen.findByRole("heading", { name: "Jubilee Hills" });
    expect(screen.getByRole("button", { name: "Check now" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    // Two writers into one page list means the loser silently decides what the
    // Partner ends up looking at.
    await waitFor(() => expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled());
  });
});
