"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's own earnings (contract 1.17.0).
 *
 * Read-only, and that is the product rather than an omission. M1 pays through a reviewed weekly
 * run — `05-pricing-payments-and-settlement.md` rules out on-demand withdrawal until
 * account-change cooling, fraud monitoring and reconciliation are all proven, and two of those
 * three are still open. A withdraw mutation here would promise something that does not exist.
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

/* -------------------------------------------------------------------------
   Performance (contract 1.19.0)
   ------------------------------------------------------------------------- */

export type PartnerPerformance = Schemas["PartnerPerformance"];

/**
 * How the Partner is doing — today, this month, and the trend behind them.
 *
 * Distinct from `usePartnerBalance`, which answers "what am I owed". Both are
 * aggregates over the same ledger; folding them together would make a screen
 * that wants today's total pull a full balance breakdown it never renders.
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
