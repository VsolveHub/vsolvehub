"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's own earnings (contract 1.17.0) and withdrawals (contract 1.85.0).
 *
 * Two writes: the bank account, which Operations reviews before it is paid into, and a
 * withdrawal of the whole available balance. Withdrawals are off until the backend's
 * `PAYOUT_WITHDRAW_ENABLED` is set; the preview says so, and the screen then draws no button.
 *
 * There is no `partner_id` anywhere: every endpoint resolves the Partner from the session, so
 * there is no identifier for this layer to get wrong.
 */

export type PartnerBalance = Schemas["PartnerBalance"];
export type LedgerEntry = Schemas["PartnerLedgerEntry"];
export type PayoutAccount = Schemas["PartnerPayoutAccount"];

export function usePartnerBalance() {
  return useQuery({
    queryKey: queryKeys.partnerMoney.balance(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/earnings/", {})),
    ...EXPIRING_STATE,
  });
}

export function usePartnerLedger() {
  return useInfiniteQuery({
    queryKey: queryKeys.partnerMoney.ledger(),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/partner/ledger/", {
          params: { query: { ...(pageParam ? { cursor: pageParam } : {}) } },
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

export function usePartnerPayoutAccount() {
  return useQuery({
    queryKey: queryKeys.partnerMoney.payoutAccount(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/payout-account/", {})),
    // No retry override. The shared policy retries only transport failures, so the "no account
    // yet" 404 (`isNoPayoutAccount`) is answered at once, while a dropped connection still is.
  });
}

/** The error code the account read answers with when the Partner has added none (1.85.1). */
const NO_PAYOUT_ACCOUNT = "payout_account_not_found";

/**
 * "None registered yet" — a state to offer "Add bank account" for, not a failure to retry.
 *
 * Matched by its error code, not by status alone: any other 404 (a wrong route, a proxy page) is
 * a real fault and must still read as one.
 */
export function isNoPayoutAccount(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === NO_PAYOUT_ACCOUNT;
}


export type PayoutAccountInput = Schemas["PartnerPayoutAccountCreateRequest"];

/**
 * Add or replace the bank account (contract 1.76.0). The result is `PENDING`: Operations checks
 * it before money can be sent there, and a 24-hour cooling period applies on top. Never retried
 * automatically — each submission registers the details with the payout provider.
 */
export function useSubmitPayoutAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PayoutAccountInput) =>
      request(() => getApiClient().POST("/api/v1/partner/payout-account/", { body })),
    onSuccess: (account) => {
      queryClient.setQueryData(queryKeys.partnerMoney.payoutAccount(), account);
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Withdrawals (contract 1.85.0)
   ------------------------------------------------------------------------- */

export type Withdrawal = Schemas["PartnerWithdrawal"];
export type WithdrawalPreview = Schemas["PartnerWithdrawalPreview"];

/** What tapping Withdraw would do right now — the server's own answer, never worked out here. */
export function useWithdrawalPreview() {
  return useQuery({
    queryKey: queryKeys.partnerMoney.withdrawalPreview(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/withdrawals/preview/", {})),
    ...EXPIRING_STATE,
  });
}

/** Withdrawals still moving get re-read every so often, so Sent turns into Paid on its own. */
function hasWithdrawalInFlight(pages: { results: Withdrawal[] }[] | undefined): boolean {
  return (pages ?? []).some((page) =>
    page.results.some((item) => item.status === "REQUESTED" || item.status === "SENT"),
  );
}

export function usePartnerWithdrawals() {
  return useInfiniteQuery({
    queryKey: queryKeys.partnerMoney.withdrawals(),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/partner/withdrawals/", {
          params: { query: { ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    refetchInterval: (query) => (hasWithdrawalInFlight(query.state.data?.pages) ? 30_000 : false),
    ...EXPIRING_STATE,
  });
}

/** One stored key per withdrawal attempt, shared by every retry of it. */
const WITHDRAWAL_ATTEMPT = "partner-withdrawal";

/** `409 withdrawal_refused`: a rule says no. Its message is written for the Partner. */
export function isWithdrawalRefused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "withdrawal_refused";
}

/**
 * Withdraw the whole available balance. No body: the server decides the amount from the locked
 * ledger, so the amount on screen is a preview and the response is the truth.
 *
 * The idempotency key survives a lost response, so tapping again after a timeout replays the
 * first withdrawal instead of making a second one. It is dropped only once the server has given
 * a definite answer — created, or refused. Never auto-retried.
 */
export function useRequestWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/partner/withdrawals/", {
          params: {
            header: { "Idempotency-Key": getStableIdempotencyKey(WITHDRAWAL_ATTEMPT) },
          },
        }),
      ),
    onSuccess: () => clearIdempotencyKey(WITHDRAWAL_ATTEMPT),
    onError: (error) => {
      if (isWithdrawalRefused(error)) clearIdempotencyKey(WITHDRAWAL_ATTEMPT);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partnerMoney.all });
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Performance (contract 1.19.0)
   ------------------------------------------------------------------------- */

export type PartnerPerformance = Schemas["PartnerPerformance"];

/**
 * How the Partner is doing — today, this month, and the trend behind them.
 *
 * Distinct from `usePartnerBalance`, which answers "what does Vsolve owe me".
 * Performance also includes mutually confirmed A3 payments made directly by
 * the Customer, because they are earnings even though they never enter Vsolve's
 * payout ledger.
 *
 * The daily series is computed server-side on purpose. Grouping the ledger in
 * the browser silently under-reports the moment a Partner has more entries than
 * fit in one page, and a revenue chart that quietly drops rows is worse than no
 * chart.
 */
export function usePartnerPerformance() {
  return useQuery({
    queryKey: queryKeys.partnerMoney.performance(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/performance/")),
    ...EXPIRING_STATE,
  });
}
