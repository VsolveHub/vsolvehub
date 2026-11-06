import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  useAcceptHandover,
  useDecideDelayClaim,
  useDecideTransfer,
  useProject,
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

describe("project queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProject", () => {
    it("fetches project details when enabled", async () => {
      mockClient.GET.mockResolvedValueOnce(ok({ id: "proj-1", milestones: [] }));

      const { result } = await renderHook(() => useProject("eng-1", true), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/engagements/{engagement_id}/project/",
        expect.objectContaining({
          params: { path: { engagement_id: "eng-1" } },
        }),
      );
    });

    it("does not fetch when enabled is false", async () => {
      await renderHook(() => useProject("eng-1", false), {
        wrapper: createWrapper(),
      });

      expect(mockClient.GET).not.toHaveBeenCalled();
    });
  });

  describe("useAcceptHandover", () => {
    it("posts handover acceptance with idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));

      const { result } = await renderHook(() => useAcceptHandover(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync("eng-1");

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/engagements/{engagement_id}/handover/acceptance/",
        expect.objectContaining({
          params: {
            path: { engagement_id: "eng-1" },
            header: expect.objectContaining({
              "Idempotency-Key": expect.any(String),
            }),
          },
        }),
      );
    });
  });

  describe("useDecideTransfer", () => {
    it("posts transfer acceptance with idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));

      const { result } = await renderHook(() => useDecideTransfer(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        engagementId: "eng-1",
        transferId: "tr-1",
        accept: true,
      });

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/project-transfers/{project_transfer_id}/decision/",
        expect.objectContaining({
          params: {
            path: { project_transfer_id: "tr-1" },
            header: expect.objectContaining({
              "Idempotency-Key": expect.any(String),
            }),
          },
          body: { accept: true },
        }),
      );
    });
  });

  describe("useDecideDelayClaim", () => {
    it("posts delay claim decision with idempotency key", async () => {
      mockClient.POST.mockResolvedValueOnce(ok({ status: "ACCEPTED" }));

      const { result } = await renderHook(() => useDecideDelayClaim(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        engagementId: "eng-1",
        delayClaimId: "claim-100",
        accept: false,
        note: "Cannot extend",
      });

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/project-delay-claims/{delay_claim_id}/decision/",
        expect.objectContaining({
          params: {
            path: { delay_claim_id: "claim-100" },
            header: expect.objectContaining({
              "Idempotency-Key": expect.any(String),
            }),
          },
          body: { accept: false, note: "Cannot extend" },
        }),
      );
    });
  });
});
