import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type { EngagementView } from "../adapters";
import { AmendmentPanel } from "./amendment-panel";

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

const mockCompleteOrOpenCheckout = jest.fn();

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  useCompleteOrOpenCheckout: () => mockCompleteOrOpenCheckout,
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

const mockEngagement: EngagementView = {
  engagementId: "eng-1",
  requirementId: "req-1",
  serviceName: "Full Home Painting",
  serviceSlug: "painting",
  status: "ACTIVE",
  mode: "managed",
  commercialMode: "MANAGED_PAYMENT_REQUIRED",
  totalLabel: "₹10,000",
  stagedTotalPaise: 1000000,
  stagedTotalLabel: "₹10,000",
  amendmentDeltaPaise: 0,
  amendmentDeltaLabel: "₹0",
  taxLabel: "₹1,800",
  fundedTotalLabel: "₹5,000",
  approvedTotalLabel: "₹0",
  releasedTotalLabel: "₹0",
  refundedTotalLabel: "₹0",
  hasRefund: false,
  commissionTreatment: null,
  createdAt: "10 Aug 2026",
  workMayStartAt: null,
  activeStageId: "stage-1",
  nextFundableStageId: "stage-2",
  nextFundableStageKind: "work",
  stagesAwaitingReviewIds: [],
  disputedStageIds: [],
  isDisputed: false,
  canAcceptCompletion: false,
  completionBlocker: null,
  canReportCashDemand: false,
  completedAt: null,
  progress: { done: 1, total: 2 },
  nextAction: "fund_stage",
  siteAddress: null,
  partnerContact: null,
  contactReleasedAt: null,
  crewTerms: null,
  accessReceipt: null,
  stages: [],
};

const mockNouns = {
  engagement: "project",
  engagementTitle: "Project",
  stage: "stage",
  stages: "stages",
  stagesHeading: "Project stages",
};

describe("AmendmentPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders empty state when there are no live amendments", async () => {
    mockClient.GET.mockResolvedValueOnce(ok({ amendments: [] }));

    const view = await render(
      <AmendmentPanel engagement={mockEngagement} nouns={mockNouns} />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(view.getByText("Changes to this job")).toBeTruthy();
      expect(
        view.getByText(/Nothing is waiting for you/),
      ).toBeTruthy();
    });
  });

  it("renders live amendment and handles acceptance with checkout handoff", async () => {
    const liveAmendment = {
      id: "amend-1",
      kind: "CHANGE_ORDER",
      status: "PROPOSED",
      reason: "Additional waterproof coating needed",
      delta_paise: 250000,
      currency: "INR",
      lines: [
        { position: 1, title: "Waterproof primer", quantity: 1, amount_paise: 250000, kind: "SCOPE" },
      ],
      stage_id: null,
      responded_at: null,
      applied_at: null,
      created_at: "2026-08-11T10:00:00+05:30",
      expires_at: "2026-08-12T10:00:00+05:30",
    };

    mockClient.GET.mockResolvedValueOnce(ok({ amendments: [liveAmendment] }));
    mockClient.POST.mockResolvedValueOnce(
      ok({
        status: "ACCEPTED",
        checkout: { payment_attempt_id: 888 },
      }),
    );

    const view = await render(
      <AmendmentPanel engagement={mockEngagement} nouns={mockNouns} />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(view.getByText("Additional waterproof coating needed")).toBeTruthy();
    });

    const acceptBtn = view.getByText("Accept this change");
    fireEvent.press(acceptBtn);

    // Confirm dialog opens
    expect(await view.findByText("Accept this change?")).toBeTruthy();
    const confirmBtn = await view.findByText("Yes, accept it");
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagement-amendments/{engagement_amendment_id}/accept/",
        expect.objectContaining({
          params: expect.objectContaining({
            path: { engagement_amendment_id: "amend-1" },
          }),
        }),
      );
      expect(mockCompleteOrOpenCheckout).toHaveBeenCalledWith("888");
    });
  });

  it("handles decline mutation on decline press", async () => {
    const liveAmendment = {
      id: "amend-2",
      kind: "TIME_EXTENSION",
      status: "PROPOSED",
      reason: "Rain delay extra hours",
      delta_paise: 0,
      currency: "INR",
      lines: [],
      stage_id: null,
      responded_at: null,
      applied_at: null,
      created_at: "2026-08-11T10:00:00+05:30",
      expires_at: "2026-08-12T10:00:00+05:30",
    };

    mockClient.GET.mockResolvedValueOnce(ok({ amendments: [liveAmendment] }));
    mockClient.POST.mockResolvedValueOnce(ok({ status: "DECLINED" }));

    const view = await render(
      <AmendmentPanel engagement={mockEngagement} nouns={mockNouns} />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(view.getByText("Rain delay extra hours")).toBeTruthy();
    });

    const declineBtn = view.getByText("No, leave it as agreed");
    fireEvent.press(declineBtn);

    await waitFor(() => {
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagement-amendments/{engagement_amendment_id}/decline/",
        expect.objectContaining({
          params: expect.objectContaining({
            path: { engagement_amendment_id: "amend-2" },
          }),
        }),
      );
    });
  });
});
