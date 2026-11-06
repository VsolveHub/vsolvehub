import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type { ProjectView } from "../adapters";
import { DelayClaimPanel } from "./delay-claim-panel";
import { HandoverPanel } from "./handover-panel";
import { ProjectDecisions } from "./project-panels";
import { VendorTransferPanel } from "./vendor-transfer-panel";
import { WarrantyPanel } from "./warranty-panel";

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

const mockProjectView: ProjectView = {
  engagementId: "eng-1",
  status: "ACTIVE",
  milestones: [
    {
      stageId: "m1",
      position: 1,
      label: "Foundation",
      kind: "work",
      amountLabel: "₹5,000",
      fundedLabel: "₹5,000",
      fundedPaise: 500000,
      isCancelled: false,
      isLeftWithVendor: false,
    },
  ],
  leftWithVendor: [],
  retention: {
    phase: "held",
    targetLabel: "₹500",
    withheldLabel: "₹500",
    warrantyEndsAt: "2026-12-01",
    isRunning: true,
  },
  handover: {
    phase: "submitted",
    submittedAt: "2026-08-11",
    acceptedAt: null,
    note: null,
    canAccept: true,
    blocksCompletion: true,
    deliverables: [
      {
        deliverableId: "d1",
        kind: "FILE",
        title: "Blueprint and Electrical Diagram",
        link: null,
        milestoneLabel: "Foundation",
        submittedAt: "2026-08-11",
        file: null,
        fileRecordMissing: false,
      },
    ],
  },
  transfer: {
    transferId: "tr-1",
    status: "PROPOSED",
    isKnownStatus: true,
    isDecidable: true,
    isApplied: false,
    direction: "same",
    previousRemainingLabel: "₹4,000",
    replacementRemainingLabel: "₹4,000",
    deltaLabel: "₹0",
    refundedLabel: "₹0",
    hasRefund: false,
    materialOutstandingLabel: "₹0",
    hasMaterialOutstanding: false,
    reasonCode: null,
    note: "Switch to Apex Builders",
    expiresAt: "2026-08-13",
    expiresAtIso: "2026-08-13T10:00:00+05:30",
    decidedAt: null,
    appliedAt: null,
    lines: [
      {
        stageId: "stage-2",
        label: "Finishing & Polish",
        agreedLabel: "₹4,000",
        replacementLabel: "₹4,000",
      },
    ],
  },
  delayClaims: [
    {
      claimId: "claim-1",
      milestoneLabel: "Foundation",
      reasonCode: "MATERIAL_DELAY",
      description: "Cement shipment delayed by transporter",
      extensionDays: 3,
      appliedDays: 0,
      status: "SUBMITTED",
      isKnownStatus: true,
      isDecidable: true,
      isApplied: false,
      expiresAt: "2099-01-01",
      expiresAtIso: "2099-01-01T10:00:00+05:30",
      decidedAt: null,
      decisionNote: null,
      createdAt: "2026-08-11",
      evidence: [],
      missingEvidenceCount: 0,
    },
  ],
};

describe("Project panels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ProjectDecisions", () => {
    it("renders decisions when project has active decisions", async () => {
      const view = await render(
        <ProjectDecisions
          engagementId="eng-1"
          project={mockProjectView}
          isPending={false}
          error={null}
          showRecoveryRoute={false}
          engagementNoun="project"
          stageNoun="stage"
          stagesNoun="stages"
          onDone={jest.fn()}
        />,
        { wrapper: createWrapper() },
      );

      expect(view.getByText("What the professional handed over")).toBeTruthy();
      expect(view.getByText("Blueprint and Electrical Diagram")).toBeTruthy();
      expect(view.getByText("We have found somebody to finish this project")).toBeTruthy();
      expect(view.getByText("The professional has asked for more time")).toBeTruthy();
      expect(view.getByText("3 days more on Foundation")).toBeTruthy();
    });
  });

  describe("HandoverPanel", () => {
    it("allows accepting deliverables", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));
      const onDone = jest.fn();

      const view = await render(
        <HandoverPanel
          engagementId="eng-1"
          handover={mockProjectView.handover}
          engagementNoun="project"
          onDone={onDone}
        />,
        { wrapper: createWrapper() },
      );

      const acceptBtn = view.getByText("Accept what was delivered");
      fireEvent.press(acceptBtn);

      expect(await view.findByText("Accept these deliverables?")).toBeTruthy();
      const confirmBtn = await view.findByText("Yes, I accept these");
      fireEvent.press(confirmBtn);

      await waitFor(() => {
        expect(mockClient.POST).toHaveBeenCalledWith(
          "/api/v1/engagements/{engagement_id}/handover/acceptance/",
          expect.anything(),
        );
        expect(onDone).toHaveBeenCalled();
      });
    });
  });

  describe("VendorTransferPanel", () => {
    it("allows accepting replacement vendor transfer", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));
      const onDone = jest.fn();

      const view = await render(
        <VendorTransferPanel
          engagementId="eng-1"
          transfer={mockProjectView.transfer!}
          leftWithVendor={[]}
          engagementNoun="project"
          stageNoun="stage"
          stagesNoun="stages"
          onDone={onDone}
        />,
        { wrapper: createWrapper() },
      );

      expect(view.getByText("We have found somebody to finish this project")).toBeTruthy();
      const acceptBtn = view.getByText("Accept this replacement");
      fireEvent.press(acceptBtn);

      expect(await view.findByText("Move this project to the replacement?")).toBeTruthy();
      const confirmBtn = await view.findByText("Yes, move it");
      fireEvent.press(confirmBtn);

      await waitFor(() => {
        expect(mockClient.POST).toHaveBeenCalledWith(
          "/api/v1/project-transfers/{project_transfer_id}/decision/",
          expect.objectContaining({
            params: {
              path: { project_transfer_id: "tr-1" },
              header: expect.anything(),
            },
            body: { accept: true },
          }),
        );
        expect(onDone).toHaveBeenCalled();
      });
    });
  });

  describe("DelayClaimPanel", () => {
    it("allows deciding delay claim", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));
      const onDone = jest.fn();

      const view = await render(
        <DelayClaimPanel
          engagementId="eng-1"
          claims={mockProjectView.delayClaims}
          engagementNoun="project"
          stageNoun="stage"
          stagesNoun="stages"
          onDone={onDone}
        />,
        { wrapper: createWrapper() },
      );

      expect(view.getByText("The professional has asked for more time")).toBeTruthy();
      expect(view.getByText("3 days more on Foundation")).toBeTruthy();
      const acceptBtn = view.getByText("Give them 3 days");
      fireEvent.press(acceptBtn);

      expect(await view.findByText("Move the dates by 3 days?")).toBeTruthy();
      const confirmBtn = await view.findByText("Yes, give them 3 days");
      fireEvent.press(confirmBtn);

      await waitFor(() => {
        expect(mockClient.POST).toHaveBeenCalledWith(
          "/api/v1/project-delay-claims/{delay_claim_id}/decision/",
          expect.objectContaining({
            params: {
              path: { delay_claim_id: "claim-1" },
              header: expect.anything(),
            },
            body: { accept: true, note: "" },
          }),
        );
        expect(onDone).toHaveBeenCalled();
      });
    });
  });

  describe("WarrantyPanel", () => {
    it("renders warranty retention summary", async () => {
      const view = await render(
        <WarrantyPanel
          retention={mockProjectView.retention}
          engagementNoun="project"
        />,
      );

      expect(view.getByText("Your warranty is running")).toBeTruthy();
      expect(view.getByText("₹500 held")).toBeTruthy();
    });
  });
});
