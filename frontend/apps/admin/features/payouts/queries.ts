"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Payout runs (contract 1.17.0).
 *
 * ## Approve and pay will refuse without a fresh step-up
 *
 * Both return `401 step_up_required` if the session has not re-verified recently. That is not an
 * error to hide — it is the control working, and the console's job is to route the operator to
 * the step-up rather than show them a failure they cannot interpret. `isStepUpRequired` exists
 * for exactly that branch.
 *
 * ## Self-approval is refused by the server, and shown before it is attempted
 *
 * `proposed_by_id` is published on the batch so the console can grey out Approve for the person
 * who proposed it. The server refuses it regardless — `403 self_approval_denied` — and this is
 * only about not offering a button that cannot work.
 */

export type PayoutBatch = Schemas["PayoutBatch"];
export type PayoutBatchRow = Schemas["PayoutBatchList"];
export type PayoutBatchStatus = Schemas["PayoutBatchStatusEnum"];

/** `401` from approve or pay: the operator must re-verify, not retry. */
export function isStepUpRequired(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "step_up_required"
  );
}

export function isSelfApproval(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "self_approval_denied"
  );
}

export function usePayoutBatches(filters: { status?: string } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.operations.payoutBatches(filters),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/operations/payout-batches/", {
          params: {
            query: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...EXPIRING_STATE,
  });
}

export function usePayoutBatch(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.payoutBatch(batchId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/payout-batches/{batch_id}/", {
          params: { path: { batch_id: batchId! } },
        }),
      ),
    enabled: batchId !== null,
    ...EXPIRING_STATE,
  });
}

function batchKey(action: string, batchId: string, version: number): string {
  return getStableIdempotencyKey(`payout-${action}:${batchId}:${version}`);
}

function useBatchCache() {
  const queryClient = useQueryClient();
  return {
    apply(batch: PayoutBatch) {
      queryClient.setQueryData(queryKeys.operations.payoutBatch(batch.id), batch);
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.operations.all, "payout-batches"],
      });
    },
    refetch(batchId: string) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operations.payoutBatch(batchId) });
    },
  };
}

interface VersionedBatch {
  batchId: string;
  expectedVersion: number;
}

function useBatchCommand(
  path:
    | "/api/v1/operations/payout-batches/{batch_id}/approve/"
    | "/api/v1/operations/payout-batches/{batch_id}/pay/"
    | "/api/v1/operations/payout-batches/{batch_id}/cancel/",
  action: string,
) {
  const cache = useBatchCache();
  return useMutation({
    mutationFn: (input: VersionedBatch) =>
      request(() =>
        getApiClient().POST(path, {
          params: {
            path: { batch_id: input.batchId },
            header: {
              "Idempotency-Key": batchKey(action, input.batchId, input.expectedVersion),
            },
          },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: cache.apply,
    // Never auto-retry a money command. An ambiguous failure re-reads and says so.
    onError: (_error, input) => cache.refetch(input.batchId),
    retry: false,
  });
}

export function useApprovePayoutBatch() {
  return useBatchCommand("/api/v1/operations/payout-batches/{batch_id}/approve/", "approve");
}

export function usePayPayoutBatch() {
  return useBatchCommand("/api/v1/operations/payout-batches/{batch_id}/pay/", "pay");
}

export function useCancelPayoutBatch() {
  return useBatchCommand("/api/v1/operations/payout-batches/{batch_id}/cancel/", "cancel");
}

export function useProposePayoutBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reference: string; periodStart: string; periodEnd: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/payout-batches/", {
          params: {
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`payout-propose:${input.reference}`),
            },
          },
          body: {
            reference: input.reference,
            period_start: input.periodStart,
            period_end: input.periodEnd,
          },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.operations.all, "payout-batches"],
      });
    },
    retry: false,
  });
}

/**
 * Partners owed money with no payable account.
 *
 * Read alongside a proposed run rather than buried: a Partner silently left out of a batch has
 * no way to find out why, and this is the list somebody chases before the run goes out.
 */
export function useUnpayablePartners(period: { start: string; end: string } | null) {
  return useQuery({
    queryKey: [...queryKeys.operations.all, "unpayable-partners", period],
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/unpayable-partners/", {
          params: { query: { period_start: period!.start, period_end: period!.end } },
        }),
      ),
    enabled: period !== null,
  });
}

/**
 * Correct what a Partner is owed by adding a ledger entry — never by editing one.
 *
 * `net_paise` is signed: positive pays the Partner more, negative recovers an overpayment.
 * Step-up, because it changes what the next payout run sends.
 */
export function useLedgerAdjustment() {
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...body
    }: {
      partner_id: string;
      net_paise: number;
      reason: string;
      /** Minted once per form attempt, so a retry cannot add the correction twice. */
      idempotencyKey: string;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/ledger-adjustments/", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body,
        }),
      ),
    retry: false,
  });
}

/** `yyyy-mm-dd` from a date input → the start of that day, local time, as ISO. */
export function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** `yyyy-mm-dd` → the last millisecond of that day, local time, as ISO. */
export function dayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
