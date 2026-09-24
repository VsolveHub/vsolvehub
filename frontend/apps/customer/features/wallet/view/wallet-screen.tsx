"use client";

import { ErrorState, Spinner } from "@vsolve/ui";
import { useWallet, useWalletTransactions } from "../queries";
import { WalletHeroCard } from "./wallet-hero-card";
import { WalletTopUpForm } from "./wallet-top-up-form";
import { WalletTransactionList } from "./wallet-transaction-list";

export function WalletScreen() {
  const walletQuery = useWallet();
  const txnsQuery = useWalletTransactions();

  if (walletQuery.isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-2 text-text-secondary">
        <Spinner size="md" />
        <span className="text-sm">Loading your wallet…</span>
      </div>
    );
  }

  if (walletQuery.isError || !walletQuery.data) {
    return (
      <ErrorState
        title="Could not load wallet"
        message="We encountered an issue checking your prepaid balance. Please try again."
        actionLabel="Retry"
        onAction={() => void walletQuery.refetch()}
      />
    );
  }

  const wallet = walletQuery.data;
  const transactions = txnsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <WalletHeroCard wallet={wallet} />
      <WalletTopUpForm wallet={wallet} />
      <WalletTransactionList transactions={transactions} />
    </div>
  );
}
