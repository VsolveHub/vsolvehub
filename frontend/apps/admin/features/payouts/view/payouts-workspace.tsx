"use client";

import { useState } from "react";

import type { StepUpSession } from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import { SectionTabs } from "@/features/shared/section-tabs";

import { LedgerAdjustment } from "./ledger-adjustment";
import { PayoutAccountReview } from "./payout-account-review";
import { PayoutConsole } from "./payout-console";
import { WithdrawalQueue } from "./withdrawal-queue";

/**
 * Paying partners. Approving, paying and correcting balances move money, so the identity check
 * sits on this page rather than on a different screen the operator has to find.
 */
export function PayoutsWorkspace() {
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  return (
    <SectionTabs
      title="Payouts"
      description="Propose a run, have a colleague approve it, then pay. Correct balances when an earning was missed or overpaid."
      tabs={[
        {
          id: "runs",
          label: "Payout runs",
          render: () => (
            <div className="flex flex-col gap-6">
              <StepUpGate
                session={session}
                reason={reason ?? undefined}
                onSteppedUp={(stepped) => {
                  setSession(stepped);
                  setReason(null);
                }}
              />
              <PayoutConsole />
            </div>
          ),
        },
        {
          id: "withdrawals",
          label: "Withdrawals",
          render: () => (
            <div className="flex flex-col gap-6">
              <StepUpGate
                session={session}
                reason={reason ?? undefined}
                onSteppedUp={(stepped) => {
                  setSession(stepped);
                  setReason(null);
                }}
              />
              <WithdrawalQueue onStepUpRequired={setReason} />
            </div>
          ),
        },
        {
          id: "accounts",
          label: "Bank accounts",
          render: () => (
            <div className="flex flex-col gap-6">
              <StepUpGate
                session={session}
                reason={reason ?? undefined}
                onSteppedUp={(stepped) => {
                  setSession(stepped);
                  setReason(null);
                }}
              />
              <PayoutAccountReview onStepUpRequired={setReason} />
            </div>
          ),
        },
        {
          id: "corrections",
          label: "Balance corrections",
          render: () => (
            <div className="flex flex-col gap-6">
              <StepUpGate
                session={session}
                reason={reason ?? undefined}
                onSteppedUp={(stepped) => {
                  setSession(stepped);
                  setReason(null);
                }}
              />
              <LedgerAdjustment onStepUpRequired={setReason} />
            </div>
          ),
        },
      ]}
    />
  );
}
