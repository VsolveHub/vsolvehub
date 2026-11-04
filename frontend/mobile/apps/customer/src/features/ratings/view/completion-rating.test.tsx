// Ported from frontend/apps/customer/features/ratings/view/completion-rating.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { CompletionRating } from "./completion-rating";

const mockClient = { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), PUT: jest.fn(), DELETE: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  useCompleteOrOpenCheckout: () => jest.fn(),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const ratingBefore = {
  subject_kind: "ENGAGEMENT" as const,
  subject_id: "engagement-1",
  can_rate: true,
  counterparty_label: "Build Right",
  my_rating: null,
  ratings: [],
};

const ratingAfter = {
  ...ratingBefore,
  can_rate: false,
  my_rating: {
    id: "rating-1",
    rater_role: "CUSTOMER" as const,
    score: 5,
    comment: "Excellent work",
    created_at: "2026-09-02T12:00:00.000Z",
    is_mine: true,
  },
};

const feedbackSummary = {
  subject_kind: "ENGAGEMENT" as const,
  subject_id: "engagement-1",
  can_submit: true,
  my_feedback: null,
  available_tags: [
    { code: "ALL_GOOD" as const, label: "All good", is_exclusive: true },
    { code: "PRICE_UNCLEAR" as const, label: "Pricing wasn't clear", is_exclusive: false },
  ],
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(mockClient)) method.mockReset();

  mockClient.GET.mockImplementation((path: string) =>
    Promise.resolve(path.includes("platform-feedback") ? ok(feedbackSummary) : ok(ratingBefore)),
  );
  mockClient.POST.mockResolvedValue(ok(ratingAfter));
});

describe("CompletionRating", () => {
  it("keeps the dialog session open for Vsolve feedback after rating the partner", async () => {
    const view = await render(<CompletionRating subject="engagement" id="engagement-1" isComplete />, { wrapper });

    await view.findByText("How was Build Right?");
    fireEvent.press(view.getByRole("button", { name: "5 stars" }));
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Next" }).props.accessibilityState?.disabled).toBeFalsy();
    });
    fireEvent.press(view.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagements/{engagement_id}/ratings/",
        expect.objectContaining({ body: { score: 5, comment: "" } }),
      ),
    );
    expect(await view.findByText("How was Vsolve itself?")).toBeTruthy();
  });
});
