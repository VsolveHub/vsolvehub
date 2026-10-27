"use client";

import { Card, formatMoney, useT } from "@vsolve/ui";
import {
  orderedStages,
  payoutSummary,
  stagePayoutState,
  type Engagement,
  type EngagementStage,
} from "@vsolve/query";
import { Banknote } from "lucide-react";
import Link from "next/link";

import { shortDate } from "@/lib/format";
import { usePartnerPayoutAccount } from "@/features/earnings/queries";

import { stageTitle, type StageWording } from "../model/engagement-copy";

/**
 * Payout holds, retention and disputes — `M2-FE-607`.
 *
 * ## The sentence this whole panel exists to get right
 *
 * **A vendor with no bank details has still earned the money.** Approving a stage
 * writes the earning as a `PENDING` entry on the M1 payout rails —
 * `_hold_stage_payout` does it at approval, and `release_stage_payout` makes it
 * payable when *both* the hold window has closed *and* the payout account is
 * verified. If the account never lands, the entry stays `PENDING` indefinitely,
 * which is the honest record. The two failures are separate and are said
 * separately: "the hold has not lapsed" and "we have nowhere to send it" are
 * different problems with different fixes, and only one of them is the vendor's.
 *
 * ## No unverified release date, ever
 *
 * `payout_release_due_at` is **nullable and its null is a policy state**: the
 * owner has configured no payout hold window, so nothing releases on a clock and
 * the entry waits for Operations. This panel renders "no release date set" there
 * — never a date, never a countdown, and never a guessed default. A date printed
 * against a window nobody configured is a promise the platform did not make, and
 * a vendor plans around it.
 *
 * ## A dispute stops one allocation
 *
 * Anything already released stays released and every other stage carries on. The
 * per-stage rows below are the proof: a disputed stage shows as disputed and its
 * siblings keep their own states.
 */

export interface PayoutPanelProps {
  readonly engagement: Engagement;
  readonly wording: StageWording;
}

export function PayoutPanel({ engagement, wording }: PayoutPanelProps) {
  const t = useT();
  const totals = payoutSummary(engagement);
  const leadOnly = engagement.commercial_mode === "LEAD_ONLY";

  if (leadOnly) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <Header />
        <p className="text-sm leading-6 text-text-secondary">
          {t("work.payoutPanel.leadOnly", { parent: wording.parent, one: wording.one })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Header />

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Figure label={t("work.payoutPanel.figure.earned")} value={formatMoney(totals.earnedPaise)} />
        <Figure label={t("work.payoutPanel.figure.stillHeld")} value={formatMoney(totals.heldPaise)} />
        <Figure label={t("work.payoutPanel.figure.released")} value={formatMoney(totals.releasedPaise)} />
      </dl>
      <p className="text-xs leading-5 text-text-muted">
        {t("work.payoutPanel.figuresExplanation", { parent: wording.parent })}
        {totals.refundedPaise === 0
          ? ""
          : ` ${t("work.payoutPanel.refunded", { amount: formatMoney(totals.refundedPaise) })}`}
      </p>

      <PayoutAccountNotice />

      <section aria-labelledby="payout-stages" className="flex flex-col gap-2">
        <h3
          id="payout-stages"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          {t("work.payoutPanel.byStage", { one: wording.one })}
        </h3>
        <ul className="flex flex-col divide-y divide-line">
          {orderedStages(engagement).map((stage) => (
            <li key={stage.id} className="flex flex-col gap-0.5 py-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-text">{stageTitle(stage, wording, t)}</span>
                <span className="shrink-0 text-sm tabular-nums text-text">
                  {formatMoney(stage.amount_paise)}
                </span>
              </span>
              <span className="text-xs leading-5 text-text-secondary">
                {describePayout(engagement, stage, wording, t)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm leading-6 text-text-secondary">
        {t("work.payoutPanel.statementNote", { parentMany: wording.parentMany })}{" "}
        <Link
          href="/money"
          className="font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          {t("work.payoutPanel.openMoney")}
        </Link>{" "}
        {t("work.payoutPanel.statementNoteSuffix")}
      </p>
    </Card>
  );
}

function Header() {
  const t = useT();
  return (
    <header className="flex items-start gap-2">
      <Banknote size={16} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
      <h2 className="text-base font-semibold text-text">{t("work.payoutPanel.heading")}</h2>
    </header>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

/**
 * One stage's money, in the vendor's words.
 *
 * `held_no_date` is the line worth reading twice. It says the money is earned,
 * says the hold has no end date configured, and says who moves it — because a
 * vendor who is told only "held" concludes it is stuck and a vendor told a date
 * plans a payment around it.
 */
function describePayout(
  engagement: Engagement,
  stage: EngagementStage,
  wording: StageWording,
  t: ReturnType<typeof useT>,
): string {
  switch (stagePayoutState(engagement, stage)) {
    case "paid_direct":
      return t("work.payoutPanel.describe.paidDirect");
    case "not_earned":
      return t("work.payoutPanel.describe.notEarned", { one: wording.one });
    case "held_until_date":
      return stage.payout_release_due_at === null
        ? t("work.payoutPanel.describe.heldNoDateShort")
        : t("work.payoutPanel.describe.heldUntilDate", {
            date: shortDate(stage.payout_release_due_at),
          });
    case "held_no_date":
      return t("work.payoutPanel.describe.heldNoDate");
    case "released":
      return stage.released_at === null
        ? t("work.payoutPanel.describe.releasedNoDate")
        : t("work.payoutPanel.describe.releasedOnDate", { date: shortDate(stage.released_at) });
    default:
      return "";
  }
}

/**
 * Whether Vsolve has anywhere to send the money.
 *
 * The progressive payout gate, read rather than guessed: `GET
 * /partner/payout-account/` answers `404` for a vendor who has registered none,
 * which is an **answer** and not a fault — hence no retry. The copy never implies
 * the earning is at risk, because it is not: it is written to the ledger at
 * approval whatever the account says.
 */
function PayoutAccountNotice() {
  const t = useT();
  const account = usePartnerPayoutAccount();

  if (account.isPending) return null;

  if (account.isError) {
    return (
      <Card className="border-dashed p-3 text-sm leading-6 text-text-secondary">
        {t("work.payoutPanel.accountNotice.missing")}{" "}
        <Link
          href="/me/profile"
          className="font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          {t("work.payoutPanel.accountNotice.addBankDetails")}
        </Link>
      </Card>
    );
  }

  if (account.data.is_payable_now) return null;

  return (
    <Card className="border-dashed p-3 text-sm leading-6 text-text-secondary">
      {account.data.verified_at === null
        ? t("work.payoutPanel.accountNotice.notVerified")
        : t("work.payoutPanel.accountNotice.notPayable")}
    </Card>
  );
}
