// Ported from frontend/apps/customer/features/booking/view/cancellation-ladder.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { CancellationLadder } from "./cancellation-ladder";

const mockGet = jest.fn();

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({
    GET: (...args: unknown[]) => mockGet(...args),
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("CancellationLadder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("renders bands passed as props", async () => {
    const view = await render(
      <CancellationLadder
        bands={[
          {
            code: "FREE_TIER",
            conditionText: "Up to 4 hours before arrival",
            feeLabel: "₹0",
            isFree: true,
          },
          {
            code: "LATE_TIER",
            conditionText: "Under 4 hours before arrival",
            feeLabel: "₹99",
            isFree: false,
          },
        ]}
        policyVersion="2"
        rescheduleFreeNoticeHours={4}
      />,
      { wrapper: TestWrapper },
    );

    expect(view.getByText("If you cancel")).toBeTruthy();
    expect(view.getByText("Up to 4 hours before arrival")).toBeTruthy();
    expect(view.getByText("Free")).toBeTruthy();
    expect(view.getByText("Under 4 hours before arrival")).toBeTruthy();
    expect(view.getByText("₹99 fee")).toBeTruthy();
    expect(view.getByText("Policy 2")).toBeTruthy();
    expect(
      view.getByText(
        "These amounts are for this booking. Changing the time is free up to 4 hours before we arrive — you only pay a fee if you cancel.",
      ),
    ).toBeTruthy();
  });

  it("fetches and renders policy from useCancellationPolicy when props are omitted", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        code: "DEFAULT_POLICY",
        version: 3,
        effective_from: "2026-01-01T00:00:00Z",
        reschedule_free_notice_hours: 6,
        quality_dispute_window_hours: 24,
        bands: [
          {
            code: "EARLY",
            condition_text: "More than 6 hours notice",
            fee: { amount_paise: 0, currency: "INR" },
          },
          {
            code: "LATE",
            condition_text: "Less than 6 hours notice",
            fee: { amount_paise: 15000, currency: "INR" },
          },
        ],
      },
      response: new Response(),
    });

    const view = await render(<CancellationLadder />, { wrapper: TestWrapper });

    expect(await view.findByText("If you cancel")).toBeTruthy();
    expect(view.getByText("More than 6 hours notice")).toBeTruthy();
    expect(view.getByText("Free")).toBeTruthy();
    expect(view.getByText("Less than 6 hours notice")).toBeTruthy();
    expect(view.getByText("Policy 3")).toBeTruthy();
  });

  it("renders null when there are no bands", async () => {
    const view = await render(<CancellationLadder bands={[]} />, { wrapper: TestWrapper });
    expect(view.toJSON()).toBeNull();
  });
});
