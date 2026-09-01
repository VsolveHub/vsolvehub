import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { VisitFeedbackForm, canShowVisitFeedback } = await import("./visit-feedback-form");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const emptySummary = {
  subject_kind: "CATALOG_BOOKING" as const,
  subject_id: "booking-1",
  can_rate: false,
  counterparty_label: "Blockage Pro",
  my_rating: null,
  ratings: [],
};

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

    expect(screen.queryByRole("heading", { name: "We value your feedback" })).not.toBeInTheDocument();
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("renders nothing when the visit is complete but cannot be rated yet", async () => {
    client.GET.mockResolvedValue(ok(emptySummary));

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await waitFor(() => expect(client.GET).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "We value your feedback" })).not.toBeInTheDocument();
  });

  it("opens as a dialog when the visit is complete and can be rated", async () => {
    client.GET.mockResolvedValue(
      ok({
        ...emptySummary,
        can_rate: true,
      }),
    );

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "We value your feedback" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeDisabled();
  });

  it("submits a rating from the completed-visit dialog", async () => {
    client.GET.mockResolvedValue(
      ok({
        ...emptySummary,
        can_rate: true,
      }),
    );
    client.POST.mockResolvedValue(
      ok({
        ...emptySummary,
        can_rate: false,
        my_rating: {
          id: "rating-1",
          rater_role: "CUSTOMER",
          score: 5,
          comment: "Great service",
          created_at: "2026-08-31T15:00:00.000Z",
          is_mine: true,
        },
        ratings: [
          {
            id: "rating-1",
            rater_role: "CUSTOMER",
            score: 5,
            comment: "Great service",
            created_at: "2026-08-31T15:00:00.000Z",
            is_mine: true,
          },
        ],
      }),
    );

    render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await screen.findByRole("heading", { name: "We value your feedback" });
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.change(screen.getByPlaceholderText(/share your experience/i), {
      target: { value: "Great service" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

    await waitFor(() => {
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/bookings/{booking_id}/ratings/",
        expect.objectContaining({
          body: { score: 5, comment: "Great service" },
        }),
      );
    });

    expect(await screen.findByText("Thank you for sharing your experience.")).toBeInTheDocument();
    expect(screen.getByText("Great service")).toBeInTheDocument();
  });
});
