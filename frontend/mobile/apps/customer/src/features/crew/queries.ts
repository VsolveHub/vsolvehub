// Ported from frontend/apps/customer/features/crew/queries.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearIdempotencyKey, getStableIdempotencyKey, request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import {
  CREW_VENDOR_NO_SHOW_REASON,
  CUSTOMER_REPORTS_CREW_PARTY,
  M2_FRESHNESS,
  boundedPoll,
  invalidateForM2Command,
  isRateCardSettled,
  m2QueryKeys,
  m2RateCardKeys,
  shouldRetryM2Read,
  type BookingFee,
  type RateCardState,
} from "@vsolve/query/native";

export type { RateCardState, BookingFee };

export function useRateCardState(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2RateCardKeys.state(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/rate-card/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    ...M2_FRESHNESS.unlock,
    ...boundedPoll<RateCardState>({ isSettled: isRateCardSettled }),
    retry: shouldRetryM2Read,
  });
}

export function useRateCardPreview(
  requirementId: string | null,
  size: { headcount: number; days: number } | null,
) {
  const headcount = size?.headcount ?? 0;
  const days = size?.days ?? 0;

  return useQuery({
    queryKey: m2RateCardKeys.preview(requirementId ?? "", headcount, days),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/rate-card/", {
          params: {
            path: { requirement_id: requirementId! },
            query: { headcount, days },
          },
        }),
      ),
    enabled: requirementId !== null && size !== null,
    placeholderData: (previous) => previous,
    ...M2_FRESHNESS.unlock,
    retry: shouldRetryM2Read,
  });
}

const BOOK_SCOPE = "m2-rate-card-book";

export function bookAtRateKey(requirementId: string): string {
  return getStableIdempotencyKey(`${BOOK_SCOPE}:${requirementId}`);
}

export function clearBookAtRateKey(requirementId: string): void {
  clearIdempotencyKey(`${BOOK_SCOPE}:${requirementId}`);
}

export interface BookAtPublishedRateInput {
  requirementId: string;
  allowDuplicate: boolean;
}

export function useBookAtPublishedRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BookAtPublishedRateInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/rate-card/book/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": bookAtRateKey(input.requirementId) },
          },
          body: { allow_duplicate: input.allowDuplicate },
        }),
      ),
    onSuccess: (state: RateCardState, input) => {
      queryClient.setQueryData(m2RateCardKeys.state(input.requirementId), state);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
    },
    retry: false,
  });
}

const FEE_CHECKOUT_SCOPE = "m2-booking-fee-checkout";

export function bookingFeeCheckoutKey(bookingId: string): string {
  return getStableIdempotencyKey(`${FEE_CHECKOUT_SCOPE}:${bookingId}`);
}

export interface StartBookingFeeCheckoutInput {
  requirementId: string;
  bookingId: string;
  isRetryAfterFailure: boolean;
}

export function useStartBookingFeeCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartBookingFeeCheckoutInput) => {
      if (input.isRetryAfterFailure) {
        clearIdempotencyKey(`${FEE_CHECKOUT_SCOPE}:${input.bookingId}`);
      }
      return request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/booking-fee/checkout/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": bookingFeeCheckoutKey(input.bookingId) },
          },
        }),
      );
    },
    onSettled: (_data, _error, input) => {
      if (input) {
        void queryClient.invalidateQueries({
          queryKey: m2RateCardKeys.state(input.requirementId),
        });
      }
    },
    retry: false,
  });
}

export interface CancelBookingInput {
  requirementId: string;
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelBookingInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/booking-fee/cancel/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-booking-fee-cancel:${input.requirementId}`,
              ),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      if (input) {
        void queryClient.invalidateQueries({
          queryKey: m2RateCardKeys.state(input.requirementId),
        });
      }
    },
    retry: false,
  });
}

export interface CrewDayInput {
  requirementId: string;
}

export function useConfirmCrewArrival() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewDayInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/crew/arrival/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-crew-arrival:${input.requirementId}`,
              ),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      if (input) {
        void invalidateForM2Command(queryClient, "confirm_shift_arrival", {
          requirementId: input.requirementId,
        });
        void queryClient.invalidateQueries({
          queryKey: m2QueryKeys.requirements.timeline(input.requirementId),
        });
      }
    },
    retry: false,
  });
}

export function useReportCrewNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewDayInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/crew/no-show/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-crew-no-show:${input.requirementId}`,
              ),
            },
          },
          body: {
            party: CUSTOMER_REPORTS_CREW_PARTY,
            reason_code: CREW_VENDOR_NO_SHOW_REASON,
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      if (input) {
        void invalidateForM2Command(queryClient, "report_crew_no_show", {
          requirementId: input.requirementId,
        });
      }
    },
    retry: false,
  });
}
