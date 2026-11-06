// Ported from frontend/apps/customer/features/shift-day/queries.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  invalidateForM2Command,
  m2QueryKeys,
  shouldRetryM2Read,
  type AttendanceResponse,
  type CashDemandReport,
  type DaySettlement,
  type DisputedWorker,
  type ShiftAttendance,
  type ShiftDay,
  type ShortfallChoice,
} from "@vsolve/query/native";
import { getApiClient } from "@vsolve/mobile-core";

export type { ShiftDay, ShiftAttendance, DaySettlement, CashDemandReport };

export function useShiftDay(engagementId: string, stageId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.shiftDays.forStage(engagementId, stageId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagement-stages/{stage_id}/shift/", {
          params: { path: { stage_id: stageId! } },
        }),
      ),
    enabled: stageId !== null && enabled,
    ...M2_FRESHNESS.attendance,
    retry: shouldRetryM2Read,
  });
}

export interface AttendanceResponseInput {
  engagementId: string;
  stageId: string;
  response: AttendanceResponse;
  shortfallChoice: ShortfallChoice | "";
  workerDetails: readonly DisputedWorker[];
  note: string;
}

export function useRespondToAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AttendanceResponseInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/attendance/response/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-attendance-response:${input.stageId}:${input.response}`,
              ),
            },
          },
          body: {
            response: input.response,
            shortfall_choice: input.shortfallChoice,
            worker_details: [...input.workerDetails],
            note: input.note,
          },
        }),
      ),
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "respond_attendance", {
        engagementId: input.engagementId,
        stageId: input.stageId,
      }),
    retry: false,
  });
}

export interface ConfirmDaySettledInput {
  engagementId: string;
  stageId: string;
}

export function useConfirmDaySettled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConfirmDaySettledInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/settlement/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-day-settled:${input.stageId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "confirm_day_settled", {
        engagementId: input.engagementId,
        stageId: input.stageId,
      }),
    retry: false,
  });
}

export interface ReportCashDemandInput {
  engagementId: string;
  stageId: string | null;
  amountClaimedPaise: number | null;
  note: string;
}

export function useReportCashDemand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportCashDemandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/cash-demand/", {
          params: {
            path: { engagement_id: input.engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-cash-demand:${input.engagementId}:${input.stageId ?? "engagement"}`,
              ),
            },
          },
          body: {
            amount_claimed_paise: input.amountClaimedPaise,
            note: input.note,
            stage_id: input.stageId,
          },
        }),
      ),
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "report_cash_demand", {
        engagementId: input.engagementId,
        ...(input.stageId === null ? {} : { stageId: input.stageId }),
      }),
    retry: false,
  });
}

