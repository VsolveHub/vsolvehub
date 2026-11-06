import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  useConfirmDaySettled,
  useReportCashDemand,
  useRespondToAttendance,
  useShiftDay,
} from "./queries";

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

describe("shift-day queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useShiftDay", () => {
    it("fetches shift day attendance when enabled", async () => {
      mockClient.GET.mockResolvedValueOnce(ok({ stage_id: "stage-1", attendance: "AWAITING_SUPERVISOR" }));

      const { result } = await renderHook(() => useShiftDay("eng-1", "stage-1", true), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/engagement-stages/{stage_id}/shift/",
        expect.objectContaining({
          params: { path: { stage_id: "stage-1" } },
        }),
      );
    });

    it("does not fetch when enabled is false", async () => {
      await renderHook(() => useShiftDay("eng-1", "stage-1", false), {
        wrapper: createWrapper(),
      });

      expect(mockClient.GET).not.toHaveBeenCalled();
    });
  });

  describe("useRespondToAttendance", () => {
    it("posts attendance response with idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "CONFIRMED" }));

      const { result } = await renderHook(() => useRespondToAttendance(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        engagementId: "eng-1",
        stageId: "stage-1",
        response: "CONFIRM",
        shortfallChoice: "CONTINUE_SHORT",
        workerDetails: [],
        note: "All good",
      });

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagement-stages/{stage_id}/attendance/response/",
        expect.objectContaining({
          params: {
            path: { stage_id: "stage-1" },
            header: expect.objectContaining({
              "Idempotency-Key": expect.any(String),
            }),
          },
          body: {
            response: "CONFIRM",
            shortfall_choice: "CONTINUE_SHORT",
            worker_details: [],
            note: "All good",
          },
        }),
      );
    });
  });

  describe("useConfirmDaySettled", () => {
    it("posts settlement confirmation with idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "SETTLED" }));

      const { result } = await renderHook(() => useConfirmDaySettled(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        engagementId: "eng-1",
        stageId: "stage-1",
      });

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagement-stages/{stage_id}/settlement/",
        expect.objectContaining({
          params: {
            path: { stage_id: "stage-1" },
            header: expect.objectContaining({
              "Idempotency-Key": expect.any(String),
            }),
          },
        }),
      );
    });
  });

  describe("useReportCashDemand", () => {
    it("posts cash demand report with paise and idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ id: "report-1" }));

      const { result } = await renderHook(() => useReportCashDemand(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        engagementId: "eng-1",
        stageId: "stage-1",
        amountClaimedPaise: 50000,
        note: "Asked for cash at door",
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
            note: "Asked for cash at door",
            stage_id: "stage-1",
          },
        }),
      );
    });
  });
});
