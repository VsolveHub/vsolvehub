"use client";

import { useState } from "react";

import type { StepUpSession } from "@/features/finance/queries";
import { CompactStepUpGate } from "@/features/finance/view/step-up-gate";
import { SectionTabs } from "@/features/shared/section-tabs";

import { LedgerAdjustment } from "./ledger-adjustment";
import { PayoutAccountReview } from "./payout-account-review";
import { PayoutConsole } from "./payout-console";
import { PayoutsAttentionSummary, usePayoutsAttention } from "./payouts-attention";
import { WithdrawalQueue } from "./withdrawal-queue";

/**
 * Paying partners.
 *
 * The page leads with what needs a person (withdrawals, bank accounts, runs) and how much is on
 * its way, so an operator sees the state of payouts without opening every tab. The identity
 * check is one line shared by all tabs: approving, paying and correcting move money, but reading
 * does not, so it stays small until it is needed and opens itself when a command asks for it.
 */
export function PayoutsWorkspace() {
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const attention = usePayoutsAttention();
  const runsWaiting = attention.runsToApprove.count + attention.runsToPay.count;

  return (
    <SectionTabs
      title="Payouts"
      description="Pay partners what they have earned, check their bank accounts, and correct balances."
      lead={
        <div className="flex flex-col gap-3">
          <PayoutsAttentionSummary attention={attention} />
          <CompactStepUpGate
            session={session}
            reason={reason ?? undefined}
            onSteppedUp={(stepped) => {
              setSession(stepped);
              setReason(null);
            }}
          />
        </div>
      }
      tabs={[
        {
          id: "withdrawals",
          label: "Withdrawals",
          count: attention.withdrawals.count,
          render: () => <WithdrawalQueue onStepUpRequired={setReason} />,
        },
        {
          id: "accounts",
          label: "Bank accounts",
          count: attention.accounts.count,
          render: () => <PayoutAccountReview onStepUpRequired={setReason} />,
        },
        {
          id: "runs",
          label: "Payout runs",
          count: runsWaiting,
          render: () => <PayoutConsole />,
        },
        {
          id: "corrections",
          label: "Balance corrections",
          render: () => <LedgerAdjustment onStepUpRequired={setReason} />,
        },
      ]}
    />
  );
}
