import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { CashDemandReport } from "./cash-demand-report";

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return QueryWrapper;
}

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

describe("CashDemandReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("expands form and submits cash demand report", async () => {
    mockClient.POST.mockResolvedValueOnce(ok({ id: "demand-1" }));

    const view = await render(
      <CashDemandReport
        engagementId="eng-1"
        stageId="stage-1"
      />,
      { wrapper: createWrapper() },
    );

    // Initial button: "They asked me for extra in cash"
    const openBtn = view.getByText("They asked me for extra in cash");
    fireEvent.press(openBtn);

    // Form fields in ConfirmAction
    expect(await view.findByText("Report a cash demand?")).toBeTruthy();
    const amountInput = view.getByPlaceholderText("2000");
    fireEvent.changeText(amountInput, "500");

    const noteInput = view.getByPlaceholderText(
      "Said the job needed an extra person and wanted the money in hand.",
    );
    fireEvent.changeText(noteInput, "Demanded cash for transport");

    const sendBtn = await view.findByText("Send the report");
    fireEvent.press(sendBtn);

    await waitFor(() => {
      expect(view.getByText("Thank you — that is recorded")).toBeTruthy();
    });

    expect(mockClient.POST).toHaveBeenCalledWith(
      "/api/v1/engagements/{engagement_id}/cash-demand/",
      expect.objectContaining({
        params: {
          path: { engagement_id: "eng-1" },
          header: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        },
        body: {
          amount_claimed_paise: 50000,
          note: "Demanded cash for transport",
          stage_id: "stage-1",
        },
      }),
    );
  });
});
