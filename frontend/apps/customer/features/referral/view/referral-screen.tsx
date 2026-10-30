"use client";

import { ErrorState, Spinner, LoadMore } from "@vsolve/ui";
import { useCustomerReferral, useReferralAttributions } from "../queries";
import { ReferralAttributionsList } from "./referral-attributions-list";
import { ReferralShareCard } from "./referral-share-card";
import { ReferralTiersStepper } from "./referral-tiers-stepper";
import { WelcomeRewardBanner } from "./welcome-reward-banner";

export function ReferralScreen() {
  const referralQuery = useCustomerReferral();
  const attributionsQuery = useReferralAttributions();

  if (referralQuery.isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-2 text-text-secondary">
        <Spinner size="md" />
        <span className="text-sm">Loading your referral rewards…</span>
      </div>
    );
  }

  if (referralQuery.isError || !referralQuery.data) {
    return (
      <ErrorState
        title="Could not load referral details"
        message="We encountered an issue checking your referral code. Please try again."
        actionLabel="Retry"
        onAction={() => void referralQuery.refetch()}
      />
    );
  }

  const summary = referralQuery.data;
  const attributions = attributionsQuery.items;

  return (
    <div className="space-y-6">
      <WelcomeRewardBanner />
      <ReferralShareCard summary={summary} />
      <ReferralTiersStepper summary={summary} />
      <ReferralAttributionsList attributions={attributions} holdDays={summary.reward_hold_days} />
      <LoadMore
        hasMore={attributionsQuery.hasMore}
        loading={attributionsQuery.loadingMore}
        onLoadMore={attributionsQuery.loadMore}
        label="Show more referrals"
      />
    </div>
  );
}

