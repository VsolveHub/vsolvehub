import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The A3 booking form and its live rate rail.
 *
 * The assertions worth having here are all about one rule: **the screen never
 * produces a number.** So the tests check where the figures came from — which
 * size was sent to the server, and that nothing is rendered when the server sent
 * nothing — rather than checking that a total looks arithmetically right, which
 * would be this suite re-implementing the pricing it is supposed to be trusting.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
const push = vi.fn();

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { BookCrewScreen } = await import("./book-crew-screen");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const RATE_PATH = "/api/v1/requirements/{requirement_id}/rate-card/";
const ADDRESS_PATH = "/api/v1/addresses/";

const address: Schemas["Address"] = {
  id: "addr-1",
  label: "Site",
  line1: "Plot 42, Survey 118",
  line2: "",
  landmark: "",
  locality: "Gachibowli",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500032",
  country_code: "IN",
  latitude: "17.440000",
  longitude: "78.348000",
  source: "REVERSE_GEOCODED",
  confirmed_at: "2026-08-01T00:00:00.000Z",
  is_default: true,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function preview(
  overrides: Partial<Schemas["RatePreview"]> = {},
): Schemas["RatePreview"] {
  return {
    is_available: true,
    rate_card_id: "card-1",
    headcount: 3,
    days: 2,
    day_rate_paise: 90_000,
    total_customer_paise: 540_000,
    lead_receipt_paise: 510_000,
    lead_day_receipt_paise: 255_000,
    booking_fee_paise: 30_000,
    standard_day_hours: 8,
    overtime_hourly_paise: 15_000,
    add_on_rates: { stairs_above_3rd_floor_per_worker_day: 10_000 },
    inclusions: ["Supervisor on site all day", "Travel to your address"],
    unavailable_code: null,
    unavailable_reason: null,
    server_now: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

function rateState(
  overrides: Partial<Schemas["RateCardState"]> = {},
): Schemas["RateCardState"] {
  return {
    preview: preview(),
    booking: null,
    booking_fee: null,
    cascade: null,
    checkout_available: false,
    confirmed_partner_id: null,
    confirmed_partner_name: null,
    engagement_id: null,
    server_now: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

/** The catalogue's A3 preset, in the order the server publishes it. */
const variant = {
  id: "variant-1",
  questions: [
    {
      id: "q-work",
      code: "work_type",
      prompt: "What will they be doing?",
      help_text: "",
      kind: "SINGLE_CHOICE",
      is_required: true,
      validation_rules: {},
      options: [
        { id: "o-1", code: "loading-unloading", label: "Loading & shifting", description: "" },
        { id: "o-2", code: "site-clearing", label: "Site clearing", description: "" },
        { id: "o-3", code: "other", label: "Something else", description: "" },
      ],
    },
    {
      id: "q-people",
      code: "worker_count",
      prompt: "People",
      help_text: "A supervisor is included with every crew.",
      kind: "NUMBER",
      is_required: true,
      validation_rules: { minimum: 1 },
      options: [],
    },
    {
      id: "q-days",
      code: "duration_days",
      prompt: "Days",
      help_text: "Consecutive days, 8-hour shifts.",
      kind: "NUMBER",
      is_required: true,
      validation_rules: { minimum: 1 },
      options: [],
    },
  ],
} as unknown as Parameters<typeof BookCrewScreen>[0]["variant"];

const service = { slug: "construction-helpers", name: "Construction helpers" } as Parameters<
  typeof BookCrewScreen
>[0]["service"];

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Routes every read this screen makes. Serviceability is a POST, so it is separate. */
function respondToReads(state = rateState()) {
  client.GET.mockImplementation((path: string) => {
    if (path === ADDRESS_PATH) return Promise.resolve(ok([address]));
    if (path === RATE_PATH) return Promise.resolve(ok(state));
    return Promise.resolve(ok(null));
  });
}

function respondToWrites() {
  client.POST.mockImplementation((path: string) => {
    if (path === "/api/v1/requirements/") return Promise.resolve(ok({ id: "req-1" }, 201));
    if (path.endsWith("/rate-card/book/")) return Promise.resolve(ok(rateState(), 201));
    return Promise.resolve(ok({ is_serviceable: true }));
  });
  client.PATCH.mockResolvedValue(ok({ id: "req-1" }));
}

/** Picks the saved address through the dialog, which is what makes the rail price. */
async function chooseAddress() {
  fireEvent.click(await screen.findByRole("button", { name: /choose the address/i }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Site/ }));
}

/** The query strings every rate read was made with. */
function rateSizes(): { headcount: number; days: number }[] {
  return client.GET.mock.calls
    .filter(([path]) => path === RATE_PATH)
    .map(([, options]) => options.params.query);
}

/**
 * Longer than the rail's 400ms re-price debounce.
 *
 * Real timers rather than fake ones: the debounce sits between a click and a
 * TanStack Query fetch, so faking time here would mean hand-driving both a
 * timeout and a microtask queue to observe one request. Waiting is slower by a
 * few hundred milliseconds and tests the thing that actually ships.
 */
const AFTER_DEBOUNCE = { timeout: 2_000 };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  push.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("BookCrewScreen rate rail", () => {
  it("does not price anything until an address is chosen", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });

    // The card is resolved through the requirement's service area, so there is
    // genuinely nothing to price yet — and the rail says so instead of showing
    // a zero.
    expect(
      await screen.findByText(/Choose where the work is and we will show the rate/),
    ).toBeInTheDocument();
    expect(rateSizes()).toHaveLength(0);
    expect(screen.queryByText("₹5,400")).not.toBeInTheDocument();
  });

  it("prices the size on the form once an address exists", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();

    // The steppers open at the catalogue's own minimum, so the first read asks
    // for that size rather than for whatever the fixture happens to return.
    await waitFor(
      () => expect(rateSizes()).toContainEqual({ headcount: 1, days: 1 }),
      AFTER_DEBOUNCE,
    );
  });

  it("re-prices on the server when a stepper changes, and writes nothing", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();
    await waitFor(() => expect(rateSizes().length).toBeGreaterThan(0), AFTER_DEBOUNCE);

    const writesBefore = client.PATCH.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "More people" }));
    fireEvent.click(screen.getByRole("button", { name: "More people" }));

    await waitFor(
      () => expect(rateSizes()).toContainEqual({ headcount: 3, days: 1 }),
      AFTER_DEBOUNCE,
    );

    // The whole point of the query-parameter preview: changing the size costs a
    // read, never a write. A draft `PATCH` per press would be a write on every
    // click of a stepper.
    expect(client.PATCH.mock.calls).toHaveLength(writesBefore);
    // And the burst collapsed rather than firing once per press.
    expect(rateSizes()).not.toContainEqual({ headcount: 2, days: 1 });
  });

  it("renders the server's figures and never a computed one", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();

    // Every one of these is a field on the payload. The per-day cash is the
    // load-bearing case: it is `lead_day_receipt_paise`, not the total divided
    // by the day count.
    expect(await screen.findByText("₹5,400")).toBeInTheDocument();
    expect(screen.getByText("₹5,100")).toBeInTheDocument();
    expect(screen.getByText("₹2,550 at the end of each day")).toBeInTheDocument();
    expect(screen.getByText("₹900")).toBeInTheDocument();
    expect(screen.getByText(/You pay ₹300 only when a supervisor accepts/)).toBeInTheDocument();
  });

  it("shows no amounts at all when the server publishes no rate", async () => {
    respondToReads(
      rateState({
        preview: preview({
          is_available: false,
          headcount: null,
          days: null,
          day_rate_paise: null,
          total_customer_paise: null,
          lead_receipt_paise: null,
          lead_day_receipt_paise: null,
          booking_fee_paise: null,
          standard_day_hours: null,
          overtime_hourly_paise: null,
          add_on_rates: null,
          inclusions: null,
          unavailable_code: "m2_rate_card_unavailable",
          unavailable_reason: "We have not published a day rate for this area.",
        }),
      }),
    );
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();

    expect(
      await screen.findByText(/We do not have a published day rate for this yet/),
    ).toBeInTheDocument();
    // The fail-closed rule: no booking control, and no invented figure.
    expect(screen.queryByRole("button", { name: "Book this crew" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get quotes instead" })).toBeInTheDocument();
    expect(screen.queryByText(/^₹/)).not.toBeInTheDocument();
  });
});

describe("BookCrewScreen booking", () => {
  it("saves the size on screen before booking it", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();
    await screen.findByText("₹5,400");

    fireEvent.change(screen.getByLabelText(/Start from/), {
      target: { value: "2026-09-07" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Loading & shifting" }));
    fireEvent.click(screen.getByRole("button", { name: "More people" }));

    await waitFor(
      () => expect(screen.getByRole("button", { name: "Book this crew" })).toBeEnabled(),
      AFTER_DEBOUNCE,
    );
    fireEvent.click(screen.getByRole("button", { name: "Book this crew" }));

    // The rail priced by query string, which writes nothing — so the draft still
    // holds the old size, and `rate-card/book/` prices the *draft*. Without this
    // save the Customer would be charged for a job they never saw priced.
    await waitFor(() => {
      const answered = client.PATCH.mock.calls.find(
        ([, options]) => options.body?.answers !== undefined,
      );
      expect(answered?.[1].body.answers).toMatchObject({
        worker_count: 2,
        duration_days: 1,
        work_type: "loading-unloading",
      });
    });

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        expect.stringContaining("/rate-card/book/"),
        expect.anything(),
      ),
    );
  });

  it("keeps the booking control disabled while a required answer is missing", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseAddress();
    await screen.findByText("₹5,400");

    // Work type and the start date are both unanswered.
    expect(screen.getByRole("button", { name: "Book this crew" })).toBeDisabled();
  });
});
