"use client";

import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, boundedPoll, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The customer's materialized Booking Groups (contract 1.9.0 reads).
 *
 * ## This layer observes; it never advances
 *
 * `POST /checkouts/{checkout_id}/search/advance/` exists in the contract and is
 * deliberately not called from anywhere in this app. It is the legacy singleton
 * progression path, and under the Booking Group model dispatch is owned by a
 * transactional outbox event and reconciled by Celery. A browser that could
 * advance dispatch would make progress depend on someone keeping a tab open,
 * which is precisely the property BE-07 was built to remove.
 *
 * So everything here is a read, plus one cancellation the customer explicitly
 * asks for. `contract-pending/boundary.test.ts` fails the build if the advance
 * path reappears in production source.
 *
 * ## Why recovery is read, not derived
 *
 * The server publishes `recovery_action` alongside `status`. It would be easy —
 * and wrong — to infer one from the other: `REPLAN_REQUIRED` obviously means
 * replan, `PAYMENT_PENDING` obviously means pay. That inference is a second
 * implementation of a rule Django already owns, and the first time the two
 * disagree the customer is offered an action the server will refuse. The field is
 * rendered as sent.
 */

export type BookingGroup = Schemas["BookingGroup"];
export type FulfilmentUnit = Schemas["FulfilmentUnit"];
export type GroupStatus = Schemas["BookingGroupStatusEnum"];
export type RecoveryAction = Schemas["RecoveryActionEnum"];

/**
 * Statuses the server cannot move a group out of on its own.
 *
 * This is what makes polling finite. Every member is a state where no Celery
 * task is pending — either the group is finished, or it is waiting on a customer
 * decision that no amount of asking will produce.
 *
 * `PAYMENT_PENDING` and `REPLAN_REQUIRED` are settled *for polling purposes*
 * without being finished: both are waiting on a person, so re-reading them on a
 * timer is asking the server to answer a question only the customer can.
 */
const SETTLED_STATUSES: readonly GroupStatus[] = [
  "BOOKED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
  "REPLAN_REQUIRED",
  "PAYMENT_PENDING",
];

export function isSettled(group: BookingGroup): boolean {
  return SETTLED_STATUSES.includes(group.status);
}

/** Terminal in the ordinary sense: nothing further will happen at all. */
const TERMINAL_STATUSES: readonly GroupStatus[] = ["BOOKED", "CANCELLED", "EXPIRED", "FAILED"];

export function isTerminal(group: BookingGroup): boolean {
  return TERMINAL_STATUSES.includes(group.status);
}

/**
 * The customer's Booking Groups.
 *
 * Page one only. `booking_group_list` paginates with a cursor at runtime but
 * publishes no `cursor` query parameter, so the generated client cannot request
 * page two — see `contracts/proposals/0008-bounded-list-cursor-parameters.md`.
 * `next` is still read, because a truncated list the customer is told about is
 * honest and a truncated list presented as complete is not.
 *
 * Not polled. A list is where someone arrives, not where they wait; the detail
 * view is what observes a live group.
 */
export function useBookingGroups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.booking.groups(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/booking-groups/")),
    enabled,
    ...EXPIRING_STATE,
  });
}

/**
 * One Booking Group, observed until it settles.
 *
 * `EXPIRING_STATE` plus bounded polling. The group carries its own `expires_at`,
 * `server_now` and `next_transition_at`, so a cached copy is exactly the thing
 * that stops being true while nobody is looking — and the poll stops the moment
 * the server's answer can no longer change on its own.
 */
export function useBookingGroup(groupId: string | null) {
  return useQuery({
    queryKey: queryKeys.booking.group(groupId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/booking-groups/{group_id}/", {
          params: { path: { group_id: groupId! } },
        }),
      ),
    enabled: groupId !== null,
    ...EXPIRING_STATE,
    ...boundedPoll<BookingGroup>({ isSettled }),
    // A group that has been cancelled or never existed will not exist on the
    // next attempt either.
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 404 || error.status === 403)
        ? false
        : failureCount < 2,
  });
}

/**
 * The stable key for cancelling one group at one version.
 *
 * The version is in the key on purpose. Re-pressing Cancel for the same group at
 * the same version is the same command and must replay; cancelling *again* after
 * the group has moved is a different command against a different world, and
 * giving it the same key would make Django answer `idempotency_key_reused`
 * rather than doing the work.
 */
export function cancelIntentKey(input: { groupId: string; expectedVersion: number }): string {
  return getStableIdempotencyKey(`booking-group-cancel:${input.groupId}:${input.expectedVersion}`);
}

export interface CancelGroupInput {
  groupId: string;
  expectedVersion: number;
}

/**
 * Cancels a pre-booking group.
 *
 * Versioned and idempotent, per the published command. No auto-retry: a 409 here
 * means the group moved while the customer was deciding, and re-sending would
 * cancel against a state they never saw.
 */
export function useCancelBookingGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelGroupInput) =>
      request(() =>
        getApiClient().POST("/api/v1/booking-groups/{group_id}/cancel/", {
          params: {
            path: { group_id: input.groupId },
            header: { "Idempotency-Key": cancelIntentKey(input) },
          },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: (group) => {
      // The command returns the whole group, so this is the new truth rather
      // than a hint to go and ask for it.
      queryClient.setQueryData(queryKeys.booking.group(group.id), group);
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.groups() });
    },
    onError: (error) => {
      // A version conflict means the customer decided against a group that has
      // since moved. Re-reading is what lets them decide again against what is
      // actually there.
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.groups() });
      }
    },
    retry: false,
  });
}

/** `409` on cancel: the version the customer saw is not the version the server holds. */
export function isGroupVersionConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

/** `400` on cancel: the group is in a state that cannot be cancelled at all. */
export function isCancellationRefused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 400;
}
