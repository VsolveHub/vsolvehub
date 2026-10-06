"use client";

import { Button, Card, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useEffect, useState } from "react";

import { useLoyaltySettings, useSaveLoyaltySettings, wholeNumber } from "../queries";

/** Waiting period and referral cap: the two settings shared by coins and referrals. */
export function RewardRulesCard() {
  const settings = useLoyaltySettings();
  const save = useSaveLoyaltySettings();
  const [holdDays, setHoldDays] = useState("");
  const [monthlyCap, setMonthlyCap] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setHoldDays(String(settings.data.reward_hold_days ?? 7));
    setMonthlyCap(String(settings.data.referral_monthly_cap ?? 0));
  }, [settings.data]);

  const hold = wholeNumber(holdDays);
  const cap = wholeNumber(monthlyCap);

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold">Reward waiting period and referral limit</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Coins earned on a booking and referral rewards become usable this many days after the
        booking is completed. A refund in that window cancels them.
      </p>
      {settings.isPending ? (
        <Spinner />
      ) : settings.isError ? (
        <ErrorState inline severity="warning" title="Settings could not be loaded" message="Try again." />
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Waiting period (days, 0–90)">
            <Input value={holdDays} onChange={(e) => setHoldDays(e.target.value)} />
          </Field>
          <Field
            label="Max referral rewards per person per month"
            description="0 = no limit. Extra rewards wait for next month."
          >
            <Input value={monthlyCap} onChange={(e) => setMonthlyCap(e.target.value)} />
          </Field>
          <Button
            loading={save.isPending}
            disabled={hold == null || hold > 90 || cap == null}
            onClick={() =>
              save.mutate({ reward_hold_days: hold ?? 7, referral_monthly_cap: cap ?? 0 })
            }
          >
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}
