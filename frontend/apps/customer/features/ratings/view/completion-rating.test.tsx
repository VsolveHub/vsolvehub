import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { CompletionRating } = await import("./completion-rating");

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
  for (const method of Object.values(client)) method.mockReset();

  client.GET.mockImplementation((path: string) =>
    Promise.resolve(path.includes("platform-feedback") ? ok(feedbackSummary) : ok(ratingBefore)),
  );
  client.POST.mockResolvedValue(ok(ratingAfter));
});

describe("CompletionRating", () => {
  it("keeps the dialog session open for Vsolve feedback after rating the partner", async () => {
    render(<CompletionRating subject="engagement" id="engagement-1" isComplete />, { wrapper });

    await screen.findByRole("heading", { name: "How was Build Right?" });
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/engagements/{engagement_id}/ratings/",
        expect.objectContaining({ body: { score: 5, comment: "" } }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "How was Vsolve itself?" }),
    ).toBeInTheDocument();
  });
});
