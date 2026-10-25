"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's own earnings (contract 1.17.0).
 *
 * No withdrawals, and that is the product rather than an omission. M1 pays through a reviewed
 * weekly run — `05-pricing-payments-and-settlement.md` rules out on-demand withdrawal until
 * account-change cooling, fraud monitoring and reconciliation are all proven, and two of those
 * three are still open. A withdraw mutation here would promise something that does not exist.
 * The one write is the bank account itself, which Operations reviews before it is paid into.
 *
 * There is no `partner_id` anywhere: both endpoints resolve the Partner from the session, so
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
    // A Partner with no registered account gets a 404. That is an answer, not a fault, so it is
    // never retried — the panel renders the "no account yet" state instead.
    retry: false,
  });
}

/** A 404 from the account read means "none registered yet", which is a state, not a failure. */
export function isNoPayoutAccount(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
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
