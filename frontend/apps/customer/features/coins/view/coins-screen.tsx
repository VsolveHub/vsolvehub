"use client";

import { ErrorState, LoadMore, Spinner } from "@vsolve/ui";
import { WelcomeRewardBanner } from "@/features/referral/view/welcome-reward-banner";

import { useCustomerCoins, useCoinTransactions } from "../queries";
import { CoinsBucketsCard } from "./coins-buckets-card";
import { CoinsBurnExplainer } from "./coins-burn-explainer";
import { CoinsTransactionList } from "./coins-transaction-list";

export function CoinsScreen() {
  const coinsQuery = useCustomerCoins();
  const txnsQuery = useCoinTransactions();

  if (coinsQuery.isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-2 text-text-secondary">
        <Spinner size="md" />
        <span className="text-sm">Loading your V Coins…</span>
      </div>
    );
  }

  if (coinsQuery.isError || !coinsQuery.data) {
    return (
      <ErrorState
        title="Could not load V Coins"
        message="We had trouble loading your coins balances. Please try again."
        actionLabel="Retry"
        onAction={() => void coinsQuery.refetch()}
      />
    );
  }

  const summary = coinsQuery.data;
  const transactions = txnsQuery.items;

  return (
    <div className="space-y-6">
      <WelcomeRewardBanner />
      <CoinsBucketsCard summary={summary} />
      <CoinsBurnExplainer summary={summary} />
      <CoinsTransactionList transactions={transactions} />
      <LoadMore
        hasMore={txnsQuery.hasMore}
        loading={txnsQuery.loadingMore}
        onLoadMore={txnsQuery.loadMore}
        label="Show older activity"
      />
    </div>
  );
}
