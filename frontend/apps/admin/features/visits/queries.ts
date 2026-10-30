"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type OperationsBooking = Schemas["OperationsBooking"];

const visitKey = (bookingId: string) => ["ops", "visit", bookingId] as const;

/** One home-service visit, as Operations sees it: both parties, status trail, payout hold. */
export function useVisit(bookingId: string | null) {
  return useQuery({
    queryKey: visitKey(bookingId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/bookings/{booking_id}/", {
          params: { path: { booking_id: bookingId as string } },
        }),
      ),
    enabled: bookingId !== null,
    ...VOLATILE_STATE,
  });
}

/** Hand the visit to the replacement Partner who committed. Keyed on booking, offer and version. */
export function useConfirmReplacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; offerId: string; expectedVersion: number }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/bookings/{booking_id}/recover/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `visit-recover:${input.bookingId}:${input.offerId}:${input.expectedVersion}`,
              ),
            },
          },
          body: { offer_id: input.offerId, expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: (booking) => queryClient.setQueryData(visitKey(booking.id), booking),
    retry: false,
  });
}

/** Start the work without the customer's code, during an OTP outage. Step-up required. */
export function useAssistedStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; outageReason: string; expectedVersion: number }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/bookings/{booking_id}/assisted-start/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `visit-assisted-start:${input.bookingId}:${input.expectedVersion}`,
              ),
            },
          },
          body: { outage_reason: input.outageReason, expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: (booking) => queryClient.setQueryData(visitKey(booking.id), booking),
    retry: false,
  });
}

export const VISIT_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  EN_ROUTE: "Partner on the way",
  ARRIVED: "Partner arrived",
  IN_PROGRESS: "Work in progress",
  COMPLETION_SUBMITTED: "Waiting for customer sign-off",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partly completed",
  DISPUTED: "Disputed",
  RECOVERY_REQUIRED: "Needs a new partner",
  ABORTED: "Aborted",
  CANCELLED: "Cancelled",
};

/** What Operations can do next on a visit, from its status alone. Exported for tests. */
export function visitActions(booking: Pick<OperationsBooking, "status" | "replacement_offer_id">): {
  confirmReplacement: boolean;
  findReplacement: boolean;
  assistedStart: boolean;
} {
  const recovering = booking.status === "RECOVERY_REQUIRED";
  return {
    confirmReplacement: recovering && Boolean(booking.replacement_offer_id),
    findReplacement: recovering && !booking.replacement_offer_id,
    assistedStart: booking.status === "ARRIVED",
  };
}
