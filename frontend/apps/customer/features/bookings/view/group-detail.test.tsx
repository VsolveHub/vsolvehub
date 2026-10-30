import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, refusal, unit, unitLine } from "../fixtures";

/**
 * The Booking Group screen.
 *
 * The assertions below are chosen for what they prevent, not for coverage:
 *
 *  - A partially held group must never read as partial success. Under
 *    `ALL_OR_NOTHING` two of three professionals means nothing is booked, and a
 *    customer who believes otherwise plans their day around visits that may
 *    never happen.
 *  - The recovery action must come from the server. Inferring it from `status`
 *    is a second implementation of a Django rule, and the first disagreement
 *    offers the customer an action that will be refused.
 *  - A cancellation must carry the version on screen, and a refused one must
 *    send the customer back to truth rather than to a retry.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookingGroupDetail } = await import("./group-detail");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const ratingSummary = {
  subject_kind: "CATALOG_BOOKING" as const,
  subject_id: "booking-1",
  can_rate: false,
  counterparty_label: "Blockage Pro",
  my_rating: null,
  ratings: [],
};

const feedbackSummary = {
  subject_kind: "CATALOG_BOOKING" as const,
  subject_id: "booking-1",
  can_submit: false,
  my_feedback: null,
  available_tags: [
    { code: "ALL_GOOD", label: "All good", is_exclusive: true },
    { code: "PRICE_UNCLEAR", label: "Pricing wasn't clear", is_exclusive: false },
    { code: "APP_PROBLEM", label: "The app was slow", is_exclusive: false },
  ],
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderDetail() {
  return render(<BookingGroupDetail groupId="group-1" />, { wrapper });
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

describe("navigation", () => {
  it("links back to the canonical Bookings page", async () => {
    client.GET.mockResolvedValue(ok(group()));

    renderDetail();

    expect(await screen.findByRole("link", { name: "Back to Bookings" })).toHaveAttribute(
      "href",
      "/activity",
    );
  });
});

describe("every unit is rendered on its own terms", () => {
  it("shows each visit with its own status, timing and lines", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({
              id: "fu-2",
              position: 1,
              status: "MATCHING",
              lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
            }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Visit 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Professional held")).toBeInTheDocument();
    expect(screen.getByText("Finding a professional")).toBeInTheDocument();
    expect(screen.getByText("Geyser repair")).toBeInTheDocument();
  });

  it("does not let one failed visit make the others look failed", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "REPLAN_REQUIRED",
          recovery_action: "REPLAN",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "FAILED" }),
          ],
        }),
      ),
    );

    renderDetail();

    const first = (await screen.findByRole("heading", { name: "Visit 1 of 2" })).closest("li")!;
    const second = screen.getByRole("heading", { name: "Visit 2 of 2" }).closest("li")!;

    expect(within(first).getByText("Professional held")).toBeInTheDocument();
    expect(within(second).getByText("No professional found")).toBeInTheDocument();
  });
});

describe("partial holds are pending, never partial success", () => {
  it("says the search is still running", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "PARTIALLY_HELD",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "MATCHING" }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/still finding professionals/i)).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is confirmed until every visit has a professional/i),
    ).toBeInTheDocument();
  });

  it("states the count beside the all-or-nothing rule, never as progress alone", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "PARTIALLY_HELD",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "MATCHING" }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/1 of 2 visits have a professional held/i)).toBeInTheDocument();
    expect(screen.getByText(/booked together or not at all/i)).toBeInTheDocument();
    // And never the words that would imply some of it is done.
    expect(screen.queryByText(/partially confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 of 2 confirmed/i)).not.toBeInTheDocument();
  });
});

describe("recovery is read from the server", () => {
  it("renders the published action rather than one inferred from status", async () => {
    // The pairing is deliberately unusual: a MATCHING group whose server says
    // REPLAN. A client that inferred the action from `status` would show "wait".
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", recovery_action: "REPLAN" })));

    renderDetail();

    expect(await screen.findByTestId("recovery-action")).toHaveTextContent(
      /choose a new arrangement/i,
    );
    expect(screen.getByRole("link", { name: /choose a new arrangement/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("offers nothing at all when the server says there is nothing to do", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "BOOKED", recovery_action: "NONE" })));

    renderDetail();
    expect(await screen.findByRole("heading", { name: "Your visit" })).toBeInTheDocument();

    expect(screen.queryByTestId("recovery-action")).not.toBeInTheDocument();
    expect(screen.queryByText(/everything is confirmed/i)).not.toBeInTheDocument();
  });

  it("says payment is needed when the server says so", async () => {
    client.GET.mockResolvedValue(
      ok(group({ status: "PAYMENT_PENDING", recovery_action: "PAYMENT_REQUIRED" })),
    );

    renderDetail();
    expect(await screen.findByTestId("recovery-action")).toHaveTextContent(/payment is needed/i);
  });
});

describe("the screen says whether it is up to date", () => {
  it("tells the customer the booking continues without the page", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING" })));

    renderDetail();

    expect(await screen.findByText(/keeps going without it/i)).toBeInTheDocument();
  });

  it("does not keep the group-status card on a booked visit", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "BOOKED", recovery_action: "NONE" })));

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Your visit" })).toBeInTheDocument();
    expect(screen.queryByText(/will not change again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keeps going without it/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/everything is confirmed/i)).not.toBeInTheDocument();
  });
});

describe("cancelling", () => {
  it("confirms in a labelled dialog before doing anything", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING" })));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/cancel this booking\?/i);
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("sends the version currently on screen", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", version: 4 })));
    client.POST.mockResolvedValue(ok(group({ status: "CANCELLED", version: 5 })));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel this booking/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].body).toEqual({ expected_version: 4 });
  });

  it("explains a version conflict as a change, not as a failure to retry through", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", version: 4 })));
    client.POST.mockResolvedValue(refusal("booking_group_version_conflict"));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel this booking/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/changed while you were deciding/i),
    );
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("offers no cancellation once the booking is finished", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "CANCELLED", recovery_action: "NONE" })));

    renderDetail();
    await screen.findByText(/this booking was cancelled/i);

    expect(screen.queryByRole("button", { name: /cancel this booking/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refresh now/i })).not.toBeInTheDocument();
  });

  it("removes cancellation but keeps refresh once the partner is on the way", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "MATCHING",
          units: [
            unit({ id: "fu-1", position: 0, status: "BOOKED", booking_status: "EN_ROUTE" }),
          ],
        }),
      ),
    );

    renderDetail();
    await screen.findByText(/your professional is on the way or work is in progress/i);

    expect(screen.queryByRole("button", { name: /cancel this booking/i })).not.toBeInTheDocument();
    // The visit is still moving, so the customer may want it now rather than at the next poll.
    expect(screen.getByRole("button", { name: /refresh now/i })).toBeInTheDocument();
  });
});

/** The customer's own read of one visit, at the given status. */
function customerVisit(status: import("@vsolve/api-client").Schemas["BookingStatusEnum"]) {
  return {
    id: "booking-1",
    fulfilment_unit_id: "fu-1",
    status,
    version: 3,
    scheduled_start: "2026-09-01T03:00:00.000Z",
    estimated_duration_minutes: 45,
    partner_display_name: "Blockage Pro",
    en_route_at: null,
    arrived_at: null,
    late_declared_at: null,
    cancelled_at: null,
    cancellation_reason: "",
    work_tasks: [],
    active_amendment: null,
    completion: null,
    cancellation_preview: {
      band_code: "FREE",
      fee_paise: 0,
      fee_waiver: "",
      refund_paise: 22800,
      currency: "INR",
    },
    reschedule_preview: {
      is_available: false,
      unavailable_reason: "",
      earliest_start: "2026-08-09T10:00:00+05:30",
    },
    server_now: "2026-08-31T15:00:00.000Z",
    partner_phone: null,
  } satisfies import("@vsolve/api-client").Schemas["CustomerBooking"];
}

/** A paid one-visit group whose Booking is at the given status. */
function paidGroupAt(bookingStatus: import("@vsolve/api-client").Schemas["BookingStatusEnum"]) {
  return group({
    status: "BOOKED",
    recovery_action: "NONE",
    order_id: "order-1",
    units: [unit({ status: "BOOKED", booking_id: "booking-1", booking_status: bookingStatus })],
  });
}

/** The three-step track, so its labels are not confused with the same words elsewhere. */
function visitTrack() {
  return within(screen.getByText("Visit status").closest("div")!);
}

describe("a visit that moves while the page is open", () => {
  it("moves the track on and takes the start code down when the visit read is newer", async () => {
    // The regression: the Partner verified the code, the group read still said
    // ARRIVED, and the customer was left looking at a spent code.
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(ok(paidGroupAt("ARRIVED")));
      }
      if (path === "/api/v1/bookings/{booking_id}/") {
        // Answers after the group read, so it is the newer of the two.
        return new Promise((resolve) => {
          setTimeout(() => resolve(ok(customerVisit("IN_PROGRESS"))), 20);
        });
      }
      return Promise.resolve(refusal("not_found", 404));
    });

    renderDetail();

    expect(await screen.findByText(/read this out to start the work/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/read this out to start the work/i)).not.toBeInTheDocument(),
    );
    expect(visitTrack().getByText("In progress")).not.toHaveClass("text-text-muted");
  });

  it("re-reads the group on Refresh now, and the newer group read wins", async () => {
    let groupReads = 0;
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        groupReads += 1;
        return Promise.resolve(ok(paidGroupAt(groupReads === 1 ? "ARRIVED" : "IN_PROGRESS")));
      }
      if (path === "/api/v1/bookings/{booking_id}/") {
        return Promise.resolve(ok(customerVisit("ARRIVED")));
      }
      return Promise.resolve(refusal("not_found", 404));
    });

    renderDetail();
    expect(await screen.findByText(/read this out to start the work/i)).toBeInTheDocument();
    expect(visitTrack().getByText("In progress")).toHaveClass("text-text-muted");

    fireEvent.click(screen.getByRole("button", { name: /refresh now/i }));

    await waitFor(() =>
      expect(screen.queryByText(/read this out to start the work/i)).not.toBeInTheDocument(),
    );
    expect(groupReads).toBe(2);
    expect(visitTrack().getByText("In progress")).not.toHaveClass("text-text-muted");
  });

  it("re-reads the visit and the group when the start code is refused", async () => {
    let groupReads = 0;
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        groupReads += 1;
        return Promise.resolve(ok(paidGroupAt("ARRIVED")));
      }
      if (path === "/api/v1/bookings/{booking_id}/") {
        return Promise.resolve(ok(customerVisit("ARRIVED")));
      }
      return Promise.resolve(refusal("not_found", 404));
    });
    client.POST.mockResolvedValue(refusal("booking_version_conflict", 409));

    renderDetail();
    const showCode = await screen.findByRole("button", { name: "Show code" });
    await waitFor(() => expect(showCode).toBeEnabled());

    fireEvent.click(showCode);

    await waitFor(() => expect(groupReads).toBe(2));
    expect(client.POST.mock.calls[0]![1].body).toEqual({ expected_version: 3 });
  });
});

describe("paid booking presentation", () => {
  it("offers reschedule and cancel on the single-visit overview, not a track page", async () => {
    const paidGroup = group({
      status: "BOOKED",
      recovery_action: "NONE",
      order_id: "order-1",
      units: [
        unit({
          status: "BOOKED",
          booking_id: "booking-1",
          booking_status: "CONFIRMED",
        }),
      ],
    });
    const bookedVisit = {
      id: "booking-1",
      fulfilment_unit_id: "fu-1",
      status: "CONFIRMED",
      version: 1,
      scheduled_start: "2026-09-01T03:00:00.000Z",
      estimated_duration_minutes: 45,
      partner_display_name: "Blockage Pro",
      en_route_at: null,
      arrived_at: null,
      late_declared_at: null,
      cancelled_at: null,
      cancellation_reason: "",
      work_tasks: [],
      active_amendment: null,
      completion: null,
      cancellation_preview: {
        band_code: "FREE",
        fee_paise: 0,
        fee_waiver: "",
        refund_paise: 22800,
        currency: "INR",
      },
      reschedule_preview: {
        is_available: true,
        unavailable_reason: "",
        earliest_start: "2026-08-09T10:00:00+05:30",
      },
      server_now: "2026-08-31T15:00:00.000Z",
      partner_phone: null,
    } satisfies import("@vsolve/api-client").Schemas["CustomerBooking"];

    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(paidGroup));
      if (path === "/api/v1/bookings/{booking_id}/") return Promise.resolve(ok(bookedVisit));
      if (path === "/api/v1/bookings/{booking_id}/ratings/") return Promise.resolve(ok(ratingSummary));
      return Promise.resolve(refusal("not_found", 404));
    });

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Your visit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your booking" })).not.toBeInTheDocument();
    expect(screen.queryByText("Everything is confirmed.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This booking is finished, so it will not change again."),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel this visit" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /track this visit/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view your receipt/i })).toHaveAttribute(
      "href",
      "/bookings/group-1/receipt",
    );
    expect(screen.queryByRole("heading", { name: "We value your feedback" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Suggestions for you" })).not.toBeInTheDocument();
    expect(screen.getByText("Can I reschedule this visit?")).toBeInTheDocument();
    expect(screen.getByText("How does cancellation & refund work?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(await screen.findByText("Reschedule this visit")).toBeInTheDocument();
  });

  it("does not offer reschedule as a suggestion on a cancelled one-visit booking", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(
          ok(
            group({
              status: "CANCELLED",
              recovery_action: "NONE",
              order_id: "order-1",
              units: [
                unit({
                  status: "CANCELLED",
                  booking_id: "booking-1",
                  booking_status: "CANCELLED",
                }),
              ],
            }),
          ),
        );
      }
      return Promise.resolve(refusal("not_found", 404));
    });

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Your booking" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Suggestions for you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "We value your feedback" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Need to reschedule/i })).not.toBeInTheDocument();
    expect(screen.getByText("This booking was cancelled. Nothing has been charged.")).toBeInTheDocument();
  });

  it("opens the feedback dialog on a completed one-visit booking that can be rated", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(
          ok(
            group({
              status: "COMPLETED",
              recovery_action: "NONE",
              order_id: "order-1",
              units: [
                unit({
                  status: "COMPLETED",
                  booking_id: "booking-1",
                  booking_status: "COMPLETED",
                }),
              ],
            }),
          ),
        );
      }
      if (path === "/api/v1/bookings/{booking_id}/ratings/") {
        return Promise.resolve(ok({ ...ratingSummary, can_rate: true }));
      }
      if (path === "/api/v1/bookings/{booking_id}/platform-feedback/") {
        return Promise.resolve(ok({ ...feedbackSummary, can_submit: false }));
      }
      return Promise.resolve(refusal("not_found", 404));
    });

    renderDetail();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how was blockage pro/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view your receipt/i })).toHaveAttribute(
      "href",
      "/bookings/group-1/receipt",
    );
    expect(screen.queryByRole("heading", { name: "Suggestions for you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Need to reschedule/i })).not.toBeInTheDocument();
  });

  it("opens the matching visit from each multi-visit card", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "BOOKED",
          recovery_action: "NONE",
          order_id: "order-1",
          units: [
            unit({
              id: "fu-1",
              position: 0,
              status: "BOOKED",
              booking_id: "booking-1",
              booking_status: "CONFIRMED",
            }),
            unit({
              id: "fu-2",
              position: 1,
              status: "BOOKED",
              booking_id: "booking-2",
              booking_status: "CONFIRMED",
              lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
            }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Your visits" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your booking" })).not.toBeInTheDocument();
    expect(screen.queryByText("Everything is confirmed.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment summary" })).toBeInTheDocument();
    expect(screen.getByText("Booking total")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view your receipt/i })).toHaveAttribute(
      "href",
      "/bookings/group-1/receipt",
    );
    const details = screen.getAllByRole("link", { name: /view details/i });
    expect(details[0]).toHaveAttribute("href", "/bookings/group-1/visits/booking-1");
    expect(details[1]).toHaveAttribute("href", "/bookings/group-1/visits/booking-2");
    expect(screen.queryByRole("link", { name: /track this visit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Suggestions for you" })).not.toBeInTheDocument();
    expect(screen.queryByText("Can I reschedule this visit?")).not.toBeInTheDocument();
  });
});

describe("failures", () => {
  it("offers a retry when the group cannot be read", async () => {
    // A 404 rather than a 500 on purpose: the hook deliberately *does* retry a
    // 5xx with backoff, so asserting against one would be timing the retry
    // policy instead of the boundary this test is about.
    client.GET.mockResolvedValue(refusal("not_found", 404));

    renderDetail();

    expect(await screen.findByText(/could not load this booking/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(client.GET).toHaveBeenCalledTimes(1);
  });
});
