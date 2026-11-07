// Ported from frontend/apps/customer/features/ratings/view/visit-feedback-form.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { VisitFeedbackForm, canShowVisitFeedback } from "./visit-feedback-form";

const mockClient = { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), PUT: jest.fn(), DELETE: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  useCompleteOrOpenCheckout: () => jest.fn(),
}));

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
    { code: "ALL_GOOD" as const, label: "All good", is_exclusive: true },
    { code: "PRICE_UNCLEAR" as const, label: "Pricing wasn't clear", is_exclusive: false },
    { code: "APP_PROBLEM" as const, label: "The app was slow", is_exclusive: false },
  ],
};

function respond({
  canRate = false,
  canSubmit = false,
}: {
  canRate?: boolean;
  canSubmit?: boolean;
}) {
  mockClient.GET.mockImplementation((path: string) =>
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
  for (const method of Object.values(mockClient)) method.mockReset();
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
  it("renders nothing before a visit is complete", async () => {
    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete={false} />, { wrapper });

    expect(view.queryByText("How was Blockage Pro?")).toBeNull();
    expect(mockClient.GET).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no question left to ask", async () => {
    respond({});

    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await waitFor(() => expect(mockClient.GET).toHaveBeenCalled());
    expect(view.queryByText("How was Blockage Pro?")).toBeNull();
  });

  it("leads with the partner's name, not a generic banner", async () => {
    respond({ canRate: true, canSubmit: true });

    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    expect(await view.findByText("How was Blockage Pro?")).toBeTruthy();
    expect(view.getByText("Next")).toBeTruthy();
  });

  it("starts on the platform question when the partner was already rated", async () => {
    respond({ canRate: false, canSubmit: true });

    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    expect(await view.findByText("How was Vsolve itself?")).toBeTruthy();
  });

  it("rates the partner, then asks about the platform, then confirms both", async () => {
    respond({ canRate: true, canSubmit: true });
    mockClient.POST.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("platform-feedback")
          ? ok({ ...feedbackSummary, can_submit: false })
          : ok({ ...ratingSummary, can_rate: false }),
      ),
    );

    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await view.findByText("How was Blockage Pro?");
    fireEvent.press(view.getByRole("button", { name: "5 stars" }));
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Next" }).props.accessibilityState?.disabled).toBeFalsy();
    });
    fireEvent.changeText(view.getByPlaceholderText("What went well, or what didn't?"), "Great service");
    await waitFor(() => {
      expect(view.getByPlaceholderText("What went well, or what didn't?").props.value).toBe("Great service");
    });
    fireEvent.press(view.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/bookings/{booking_id}/ratings/",
        expect.objectContaining({ body: { score: 5, comment: "Great service" } }),
      ),
    );

    await view.findByText("How was Vsolve itself?");
    fireEvent.press(view.getByRole("button", { name: "Pricing wasn't clear" }));
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Send" }).props.accessibilityState?.disabled).toBeFalsy();
    });
    fireEvent.press(view.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/bookings/{booking_id}/platform-feedback/",
        expect.objectContaining({
          body: { score: null, tags: ["PRICE_UNCLEAR"], comment: "" },
        }),
      ),
    );

    expect(await view.findByText("Thanks — that's noted.")).toBeTruthy();
    expect(view.getByText(/Great service/)).toBeTruthy();
    expect(view.getByText(/Pricing wasn't clear/)).toBeTruthy();
  });

  it("keeps All good exclusive of the complaints", async () => {
    respond({ canRate: false, canSubmit: true });

    const view = await render(<VisitFeedbackForm bookingId="booking-1" isComplete />, { wrapper });

    await view.findByText("How was Vsolve itself?");
    fireEvent.press(view.getByRole("button", { name: "Pricing wasn't clear" }));
    await view.findByText("✓ Pricing wasn't clear");
    fireEvent.press(view.getByRole("button", { name: "All good" }));

    expect(await view.findByText("✓ All good")).toBeTruthy();
    expect(view.queryByText("✓ Pricing wasn't clear")).toBeNull();
  });
});
