"use client";

import { segmentStyles } from "@vsolve/ui";
import { useState } from "react";

import type { StepUpSession } from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";

import { CustomerLedgerPanel } from "./customer-ledger-panel";
import { EarnRulesPanel } from "./earn-rules-panel";
import { LoyaltyBoard } from "./loyalty-board";
import { ReferralProgramEditor } from "./referral-program-editor";
import { ReferralReviewQueue } from "./referral-review-queue";

const TABS = [
  { key: "settings", label: "Settings" },
  { key: "earn", label: "Earn rules" },
  { key: "program", label: "Referral program" },
  { key: "review", label: "Referral review" },
  { key: "customer", label: "Customer lookup" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function LoyaltyWorkspace() {
  const [tab, setTab] = useState<TabKey>("settings");
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [stepUpReason, setStepUpReason] = useState<string | null>(null);
  // Reject, reverse and coin adjustments move value, so they sit behind the same
  // step-up confirmation as refunds.
  const needsStepUp = tab === "review" || tab === "customer";

  return (
    <div className="mt-4">
      <div role="tablist" aria-label="Wallet and loyalty sections" className="flex flex-wrap gap-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={segmentStyles({ selected: tab === item.key })}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {needsStepUp ? (
        <div className="mt-4">
          <StepUpGate
            session={session}
            reason={stepUpReason ?? undefined}
            onSteppedUp={(stepped) => {
              setSession(stepped);
              setStepUpReason(null);
            }}
          />
        </div>
      ) : null}

      <div className="mt-4">
        {tab === "settings" ? <LoyaltyBoard /> : null}
        {tab === "earn" ? <EarnRulesPanel /> : null}
        {tab === "program" ? <ReferralProgramEditor /> : null}
        {tab === "review" ? <ReferralReviewQueue onStepUpRequired={setStepUpReason} /> : null}
        {tab === "customer" ? <CustomerLedgerPanel onStepUpRequired={setStepUpReason} /> : null}
      </div>
    </div>
  );
}
