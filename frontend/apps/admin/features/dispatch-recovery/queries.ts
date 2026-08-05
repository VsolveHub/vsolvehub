"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import type { DispatchCommand, DispatchReason } from "./model/commands";

/**
 * Operations' four dispatch-recovery endpoints — one read and three overrides.
 *
 * ## The explanation is the only read, and it is read volatile
 *
 * `GET /operations/fulfilment-units/{id}/dispatch-explanation/` is the single
 * published read here, and it is where `expected_unit_version` comes from. A
 * unit under active dispatch changes on a Celery beat tick, not on a human
 * timescale, so serving a minute-old version would produce a console that
 * confidently sends a guard value it knows to be stale.
 *
 * ## One key per command, target and version
 *
 * All three commands require an `Idempotency-Key`. The key is derived from the
 * command, the record it addresses and the version it is guarded on — which is
 * exactly "this operator's decision about this state". A double-click, a lost
 * response or a refresh mid-request replays the first outcome instead of
 * revoking a second offer.
 *
 * It does not need clearing on success. `execute_idempotent` runs inside the
 * command's own transaction, so a *failed* command leaves no record and a
 * corrected retry is free; a *successful* one moves the unit's version, so the
 * next command is a different key by construction.
 *
 * ## What is not written back into the cache
 *
 * Nothing. Each command returns a projection of what it just did — an offer, a
 * reservation, a unit — and none of those is a dispatch explanation. Writing one
 * into the explanation's key would put a command's own account of itself where
 * the console reads dispatch's account of the decision. The explanation is
 * refetched instead, including after a refusal, because a refusal is exactly
 * when the operator's copy is known to be wrong.
 */

export type Explanation = Schemas["DispatchExplanation"];
export type UnitDispatch = Schemas["FulfilmentUnitDispatch"];
export type DispatchReservation = Schemas["DispatchReservation"];
export type Offer = Schemas["Offer"];

export function useDispatchExplanation(unitId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.dispatchExplanation(unitId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/", {
          params: { path: { unit_id: unitId as string } },
        }),
      ),
    enabled: unitId !== null,
    ...VOLATILE_STATE,
  });
}

export interface DispatchCommandInput {
  /** The offer, reservation or unit the command is addressed to. */
  targetId: string;
  /** The Fulfilment Unit whose explanation this decision was taken from. */
  unitId: string;
  /** The version shown to the operator. Never typed — see `model/commands.ts`. */
  expectedUnitVersion: number;
  reason: DispatchReason;
  note: string;
}

/** One stable key for one decision about one state. */
export function dispatchIntentKey(
  command: DispatchCommand,
  input: Pick<DispatchCommandInput, "targetId" | "expectedUnitVersion">,
): string {
  return getStableIdempotencyKey(
    `dispatch-${command}:${input.targetId.trim()}:${input.expectedUnitVersion}`,
  );
}

export type DispatchOutcome = Offer | DispatchReservation | UnitDispatch;

/**
 * Sends one command, keeping each endpoint's own generated types intact.
 *
 * Written as three separate calls rather than one parameterised request. The
 * three paths take different path parameters and answer with three different
 * projections — an offer, a reservation, a unit — and a single call built from a
 * variable would have to be cast back to something the compiler could accept,
 * which is where a client stops being checked against the contract.
 */
function runCommand(
  command: DispatchCommand,
  input: DispatchCommandInput,
): Promise<DispatchOutcome> {
  const client = getApiClient();
  const params = { header: { "Idempotency-Key": dispatchIntentKey(command, input) } };
  const body = {
    expected_unit_version: input.expectedUnitVersion,
    reason: input.reason,
    note: input.note.trim(),
  };

  if (command === "revoke") {
    return request(() =>
      client.POST("/api/v1/operations/offers/{offer_id}/revoke/", {
        params: { ...params, path: { offer_id: input.targetId.trim() } },
        body,
      }),
    );
  }
  if (command === "release") {
    return request(() =>
      client.POST("/api/v1/operations/reservations/{reservation_id}/release/", {
        params: { ...params, path: { reservation_id: input.targetId.trim() } },
        body,
      }),
    );
  }
  return request(() =>
    client.POST("/api/v1/operations/fulfilment-units/{unit_id}/recover/", {
      params: { ...params, path: { unit_id: input.targetId.trim() } },
      body,
    }),
  );
}

/**
 * Runs one dispatch override.
 *
 * Never retried automatically, on any outcome. A retried revoke is a second
 * Partner losing an offer; a retried release can unwind a Booking Group that the
 * first attempt already unwound. The idempotency key makes a *deliberate* repeat
 * safe — it does not make an automatic one meaningful, because an automatic
 * retry hides from the operator that the first attempt's outcome was never seen.
 */
export function useDispatchCommand(command: DispatchCommand) {
  const queryClient = useQueryClient();

  function reread(unitId: string) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.operations.dispatchExplanation(unitId),
    });
  }

  return useMutation({
    mutationFn: (input: DispatchCommandInput) => runCommand(command, input),
    // The unit's version has moved, and the explanation the operator is looking
    // at is the thing that carries it.
    onSuccess: (_outcome, input) => reread(input.unitId),
    // A refusal means the console's copy was already wrong, whatever the reason.
    onError: (_error, input) => reread(input.unitId),
    retry: false,
  });
}
