import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feedback on a completed visit, now the same two-step sequence requests get.
 *
 * The copy moved with it: the dialog leads with the partner's name rather than "We value your
 * feedback", because a customer who has just had a plumber in their kitchen is being asked about
 * *that plumber*, and a generic banner is the part they scroll past.
 *
 * The assertions that matter are the two the previous version could not make: that the second
 * question is asked at all, and that the confirmation shows what was said. The latter used to read
 * `my_rating` back from the server, which contract 1.57.0 pinned to null — so it silently stopped
 * appearing and nothing caught it.
 */
const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { VisitFeedbackForm, canShowVisitFeedback } = await import("./visit-feedback-form");

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

/** Routes each GET by path so the two independent questions can answer differently. */
function respond({
  canRate = false,
  canSubmit = false,
}: {
  canRate?: boolean;
  canSubmit?: boolean;
}) {
  client.GET.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("platform-feedback")
        ? ok({ ...feedbackSummary, can_submit: canSubmit })
        : ok({ ...ratingSummary, can_rate: canRate }),
    ),
  );
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

describe("canShowVisitFeedback", () => {
  const paid = {
    bookingId: "booking-1",
    isPaid: true,
    unitStatus: "BOOKED",
    bookingStatus: "CONFIRMED",
  };

  it("is false until the visit itself is complete", () => {
    expect(canShowVisitFeedback(paid)).toBe(false);
    expect(canShowVisitFeedback({ ...paid, bookingStatus: "IN_PROGRESS" })).toBe(false);
    expect(canShowVisitFeedback({ ...paid, bookingStatus: "COMPLETION_SUBMITTED" })).toBe(false);
  });

  it("is true for a paid completed visit", () => {
    expect(canShowVisitFeedback({ ...paid, bookingStatus: "COMPLETED" })).toBe(true);
    expect(canShowVisitFeedback({ ...paid, bookingStatus: "PARTIALLY_COMPLETED" })).toBe(true);
  });
});

describe("VisitFeedbackForm", () => {
  it("renders nothing before a visit is complete", () => {
    render(<VisitFeedbackForm bookingId="booking-1" isComplete={false} />, { wrapper });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no question left to ask", async () => {
    respond({});

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await waitFor(() => expect(client.GET).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leads with the partner's name, not a generic banner", async () => {
    respond({ canRate: true, canSubmit: true });

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How was Blockage Pro?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("starts on the platform question when the partner was already rated", async () => {
    respond({ canRate: false, canSubmit: true });

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    expect(
      await screen.findByRole("heading", { name: "How was Vsolve itself?" }),
    ).toBeInTheDocument();
  });

  it("rates the partner, then asks about the platform, then confirms both", async () => {
    respond({ canRate: true, canSubmit: true });
    client.POST.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("platform-feedback")
          ? ok({ ...feedbackSummary, can_submit: false })
          : ok({ ...ratingSummary, can_rate: false }),
      ),
    );

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await screen.findByRole("heading", { name: "How was Blockage Pro?" });
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.change(screen.getByPlaceholderText(/what went well/i), {
      target: { value: "Great service" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/bookings/{booking_id}/ratings/",
        expect.objectContaining({ body: { score: 5, comment: "Great service" } }),
      ),
    );

    // Step 2: a chip alone is a complete answer — no star required.
    await screen.findByRole("heading", { name: "How was Vsolve itself?" });
    fireEvent.click(screen.getByRole("button", { name: /Pricing wasn't clear/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/bookings/{booking_id}/platform-feedback/",
        expect.objectContaining({
          body: { score: null, tags: ["PRICE_UNCLEAR"], comment: "" },
        }),
      ),
    );

    // Built from what was just submitted, not read back from a server field that is null.
    expect(await screen.findByRole("heading", { name: "Thanks — that's noted." })).toBeInTheDocument();
    expect(screen.getByText("Great service", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Pricing wasn't clear")).toBeInTheDocument();
  });

  it("keeps All good exclusive of the complaints", async () => {
    respond({ canRate: false, canSubmit: true });

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await screen.findByRole("heading", { name: "How was Vsolve itself?" });
    fireEvent.click(screen.getByRole("button", { name: /Pricing wasn't clear/ }));
    fireEvent.click(screen.getByRole("button", { name: /All good/ }));

    expect(screen.getByRole("button", { name: /All good/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Pricing wasn't clear/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
