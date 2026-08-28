import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeCrewBookingIntent } from "../model/booking-intent";

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
        { id: "o-1", code: "loading-unloading", label: "Loading and unloading", description: "Moving material off and onto vehicles." },
        { id: "o-2", code: "material-shifting", label: "Material shifting on site", description: "Carrying material between floors and store rooms." },
        { id: "o-3", code: "site-clearing", label: "Site clearing and debris removal", description: "Clearing rubble and preparing a space." },
        { id: "o-4", code: "masonry-helper", label: "Masonry and concreting helper", description: "Assisting a mason or concreting crew." },
        { id: "o-5", code: "painting-helper", label: "Painting and finishing helper", description: "Surface preparation and painter support." },
        { id: "o-6", code: "demolition-support", label: "Demolition support", description: "Breaking out and clearing under supervision." },
        { id: "o-7", code: "general-labour", label: "General site labour", description: "A mix directed by the site supervisor." },
        { id: "o-8", code: "other", label: "Something else", description: "Tell us in a sentence." },
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
    {
      id: "q-work-description",
      code: "work_description",
      prompt: "Tell us what the work is",
      help_text: "A short sentence is enough.",
      kind: "TEXT",
      is_required: false,
      validation_rules: {},
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

/** Confirms step one. This must remain a local-only choice. */
async function chooseWork() {
  fireEvent.click(await screen.findByRole("radio", { name: /^Loading and unloading/ }));
  fireEvent.click(screen.getByRole("button", { name: "Plan this crew" }));
}

async function openRate() {
  await chooseWork();
  await chooseAddress();
  fireEvent.change(screen.getByLabelText(/Start from/), {
    target: { value: "2026-09-07" },
  });
  fireEvent.click(screen.getByRole("button", { name: "See my live rate" }));
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
  window.sessionStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("BookCrewScreen rate rail", () => {
  it("creates and prices nothing while the customer browses and chooses work", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    expect(await screen.findAllByRole("radio")).toHaveLength(8);
    fireEvent.click(screen.getByRole("radio", { name: /^Loading and unloading/ }));

    // Comparing or selecting a work card is navigation state, not a request.
    expect(rateSizes()).toHaveLength(0);
    expect(client.POST).not.toHaveBeenCalledWith(
      "/api/v1/requirements/",
      expect.anything(),
    );
    expect(screen.queryByText("₹5,400")).not.toBeInTheDocument();
  });

  it("prices the size only after the complete plan is confirmed", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await openRate();

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
    await openRate();
    await waitFor(() => expect(rateSizes().length).toBeGreaterThan(0), AFTER_DEBOUNCE);

    const writesBefore = client.PATCH.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Change crew plan" }));
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
    await openRate();

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
    await openRate();

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
  it("restores the unfinished work, date and address after a reload without creating a request", async () => {
    respondToReads();
    respondToWrites();
    writeCrewBookingIntent(window.sessionStorage, {
      serviceSlug: service.slug,
      variantId: variant.id,
      requirementId: null,
      answers: {
        work_type: "loading-unloading",
        worker_count: 3,
        duration_days: 2,
      },
      addressId: address.id,
      requestedStart: "2026-09-07",
      reportingTime: null,
      step: "details",
    });

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });

    expect(
      await screen.findByRole("heading", { name: "Build your construction helpers crew" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Start from/)).toHaveValue("2026-09-07");
    expect(
      screen.getByRole("button", { name: /loading and unloading.*change/i }),
    ).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalledWith(
      "/api/v1/requirements/",
      expect.anything(),
    );
  });

  it("asks for a sentence only when Something else is chosen", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    fireEvent.click(await screen.findByRole("radio", { name: /^Something else/ }));
    fireEvent.click(screen.getByRole("button", { name: "Plan this crew" }));

    expect(screen.getByLabelText("Tell us what the work is")).toBeInTheDocument();
  });

  it("saves the size on screen before booking it", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={service} variant={variant} />, { wrapper });
    await chooseWork();
    await chooseAddress();
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "2026-09-07" } });
    fireEvent.click(screen.getByRole("button", { name: "More people" }));
    fireEvent.click(screen.getByRole("button", { name: "See my live rate" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Book this crew" })).toBeEnabled(), AFTER_DEBOUNCE);
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
    await chooseWork();
    await chooseAddress();

    // The start date is unanswered, so the details action cannot create or price a draft.
    expect(screen.getByRole("button", { name: "See my live rate" })).toBeDisabled();
  });
});

/** The event-staff catalogue: an occasion, a crowd, a service style, roles, then how they turn up. */
const eventVariant = {
  id: "variant-event",
  questions: [
    {
      id: "q-occasion",
      code: "event_type",
      prompt: "What's the occasion?",
      help_text: "",
      kind: "SINGLE_CHOICE",
      is_required: true,
      validation_rules: {},
      options: [
        { id: "o-w", code: "wedding", label: "Wedding", description: "Reception or the day itself." },
        { id: "o-o", code: "other", label: "Something else", description: "Tell us in a sentence." },
      ],
    },
    { id: "q-desc", code: "event_description", prompt: "Tell us about the event", help_text: "", kind: "TEXT", is_required: false, validation_rules: {}, options: [] },
    {
      id: "q-guests",
      code: "guest_band",
      prompt: "How many guests?",
      help_text: "",
      kind: "SINGLE_CHOICE",
      is_required: true,
      validation_rules: {},
      options: [
        { id: "o-g1", code: "under-50", label: "Under 50", description: "" },
        { id: "o-g2", code: "100-200", label: "100 to 200", description: "" },
      ],
    },
    {
      id: "q-style",
      code: "service_style",
      prompt: "How is food served?",
      help_text: "",
      kind: "SINGLE_CHOICE",
      is_required: true,
      validation_rules: {},
      options: [{ id: "o-b", code: "buffet", label: "Buffet", description: "Guests walk up to the counters." }],
    },
    { id: "q-waiters", code: "waiter_count", prompt: "Waiters and serving staff", help_text: "Serving and clearing.", kind: "NUMBER", is_required: false, validation_rules: { minimum: 0 }, options: [] },
    { id: "q-bar", code: "bar_staff_count", prompt: "Bar and beverage staff", help_text: "", kind: "NUMBER", is_required: false, validation_rules: { minimum: 0 }, options: [] },
    { id: "q-staff", code: "worker_count", prompt: "Staff", help_text: "", kind: "NUMBER", is_required: true, validation_rules: { minimum: 1 }, options: [] },
    { id: "q-days", code: "duration_days", prompt: "Days", help_text: "", kind: "NUMBER", is_required: true, validation_rules: { minimum: 1 }, options: [] },
    {
      id: "q-dress",
      code: "dress_code",
      prompt: "Dress code",
      help_text: "",
      kind: "SINGLE_CHOICE",
      is_required: true,
      validation_rules: {},
      options: [{ id: "o-bw", code: "black-white", label: "Black and white formal", description: "" }],
    },
    { id: "q-meal", code: "staff_meal_provided", prompt: "Will you provide a meal for the staff?", help_text: "", kind: "BOOLEAN", is_required: true, validation_rules: {}, options: [] },
  ],
} as unknown as Parameters<typeof BookCrewScreen>[0]["variant"];

const eventService = { slug: "event-staff-by-the-day", name: "Event staff by the day" } as Parameters<
  typeof BookCrewScreen
>[0]["service"];

describe("BookCrewScreen for event staff", () => {
  it("opens on the occasion and prices nobody until a role is counted", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={eventService} variant={eventVariant} />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Staff your event, role by role." })).toBeInTheDocument();
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my live rate" })).toBeDisabled();
    expect(rateSizes()).toHaveLength(0);
  });

  it("keeps a serving count the customer set by hand when the occasion changes", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={eventService} variant={eventVariant} />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /^Wedding/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Under 50" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Buffet/ }));
    // 40 guests at a buffet: one serving person. The customer wants three.
    expect(screen.getByText(/1 person × 1 day/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More waiters and serving staff" }));
    fireEvent.click(screen.getByRole("button", { name: "More waiters and serving staff" }));

    // A bigger crowd would suggest five — but three was theirs, and it stays.
    fireEvent.click(screen.getByRole("radio", { name: "100 to 200" }));
    expect(screen.getByText(/3 people × 1 day/)).toBeInTheDocument();
  });

  it("prices the sum of the roles, and saves the roles beside the headcount", async () => {
    respondToReads();
    respondToWrites();

    render(<BookCrewScreen service={eventService} variant={eventVariant} />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /^Wedding/ }));
    fireEvent.click(screen.getByRole("radio", { name: "100 to 200" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Buffet/ }));
    // 150 guests at a buffet starts the crew with five serving staff, already
    // on the roster rather than in a sentence. The customer adjusts from there.
    expect(screen.getByText(/we have started you with/)).toBeInTheDocument();
    expect(screen.getByText(/5 people × 1 day/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More waiters and serving staff" }));
    fireEvent.click(screen.getByRole("button", { name: "More bar and beverage staff" }));
    fireEvent.click(screen.getByRole("button", { name: "More bar and beverage staff" }));
    expect(screen.getByText(/8 people × 1 day/)).toBeInTheDocument();

    await chooseAddress();
    fireEvent.change(screen.getByLabelText(/Event date/), { target: { value: "2026-09-14" } });
    fireEvent.change(screen.getByLabelText(/Reporting time/), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("radio", { name: "Black and white formal" }));
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));

    fireEvent.click(screen.getByRole("button", { name: "See my live rate" }));

    await waitFor(
      () => expect(rateSizes()).toContainEqual({ headcount: 8, days: 1 }),
      AFTER_DEBOUNCE,
    );

    const answered = client.PATCH.mock.calls.find(
      ([, options]) => options.body?.answers !== undefined,
    );
    expect(answered?.[1].body.answers).toMatchObject({
      event_type: "wedding",
      guest_band: "100-200",
      service_style: "buffet",
      waiter_count: 6,
      bar_staff_count: 2,
      worker_count: 8,
      duration_days: 1,
      dress_code: "black-white",
      staff_meal_provided: true,
    });
    // The reporting time rides on `requested_start` rather than a midnight day.
    const saved = new Date(answered?.[1].body.requested_start as string);
    expect(saved.getHours()).toBe(17);
    expect(saved.getDate()).toBe(14);
  });
});
