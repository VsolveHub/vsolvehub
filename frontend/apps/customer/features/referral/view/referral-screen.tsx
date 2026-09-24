"use client";

import { ErrorState, Spinner } from "@vsolve/ui";
import { useCustomerReferral, useReferralAttributions } from "../queries";
import { ReferralAttributionsList } from "./referral-attributions-list";
import { ReferralShareCard } from "./referral-share-card";
import { ReferralTiersStepper } from "./referral-tiers-stepper";

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
  // The /attributions/ endpoint returns ReferralAttribution[] directly (not paginated)
  const attributions = attributionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <ReferralShareCard summary={summary} />
      <ReferralTiersStepper summary={summary} />
      <ReferralAttributionsList attributions={attributions} />
    </div>
  );
}

