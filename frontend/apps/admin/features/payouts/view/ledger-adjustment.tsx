"use client";

import { getStableIdempotencyKey } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Button,
  Card,
  ChoiceChips,
  Dialog,
  Field,
  Input,
  Spinner,
  Textarea,
  formatMoney,
} from "@vsolve/ui";
import { useState } from "react";

import { isStepUpRequired } from "@/features/finance/queries";
import { usePartnerActivity } from "@/features/partners/view/partner-activity";
import {
  PartnerPicker,
  type PickedPartner,
} from "@/features/partners/view/partner-picker";

import { useLedgerAdjustment } from "../queries";

/** Signed rupees → integer paise, or null. Zero is not a correction. Exported for tests. */
export function signedPaise(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const paise = Math.round(Number(text) * 100);
  return paise === 0 ? null : paise;
}

export type Direction = "add" | "recover";

/** Unsigned rupees → integer paise, or null. A sign is chosen with the switch, not typed. */
export function amountPaise(raw: string): number | null {
  const paise = signedPaise(raw.replace(/[₹,\s]/g, ""));
  return paise !== null && paise > 0 ? paise : null;
}

/** The signed correction the server takes: positive adds, negative recovers. */
export function correctionPaise(direction: Direction, raw: string): number | null {
  const paise = amountPaise(raw);
  if (paise === null) return null;
  return direction === "add" ? paise : -paise;
}

/**
 * The reasons Operations writes most, one tap each. They fill the box rather than replace it,
 * so a booking reference or a name can still be added before saving.
 */
export const SUGGESTED_REASONS: Record<Direction, readonly string[]> = {
  add: [
    "Missed earning for a completed job",
    "Travel or material cost reimbursed",
    "Goodwill amount approved by Operations",
    "Earning restored after a dispute was resolved",
  ],
  recover: [
    "Overpaid in an earlier payout",
    "Earning for a job that was cancelled or refunded",
    "Duplicate earning entry",
    "Amount recovered after a dispute",
  ],
};

const QUICK_AMOUNTS = [100, 250, 500, 1000];

const DIRECTIONS = [
  { value: "add", label: "Add money", description: "The partner is owed more" },
  { value: "recover", label: "Take back", description: "The partner was paid too much" },
] as const;

/**
 * The partner's available balance now, and after the correction once there is an amount.
 * Mounted only with a partner.
 */
function BalanceChange({
  partnerId,
  paise,
}: {
  partnerId: string;
  paise: number | null;
}) {
  const activity = usePartnerActivity(partnerId);
  if (activity.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" />
        Reading the current balance…
      </p>
    );
  }
  if (activity.isError || !activity.data) {
    return (
      <p className="text-sm text-text-secondary">
        The current balance could not be read.
        {paise !== null
          ? ` The correction is still ${formatMoney(Math.abs(paise))} ${
              paise > 0 ? "added to" : "taken from"
            } what the partner is owed.`
          : ""}
      </p>
    );
  }
  const before = activity.data.balance.available_paise;
  if (paise === null) {
    return (
      <p className="text-sm text-text-secondary">
        Available now:{" "}
        <span data-numeric className="font-semibold text-text">
          {formatMoney(before)}
        </span>
      </p>
    );
  }
  const after = before + paise;
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-control border border-line p-3 text-sm">
      <div>
        <dt className="text-xs text-text-muted">Available now</dt>
        <dd data-numeric className="font-semibold text-text">
          {formatMoney(before)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-text-muted">Available after</dt>
        <dd data-numeric className="font-semibold text-text">
          {after < 0 ? `−${formatMoney(-after)}` : formatMoney(after)}
        </dd>
      </div>
      {after < 0 ? (
        <p className="col-span-2 text-xs text-text-secondary">
          Below zero: the difference comes off this partner&apos;s future
          earnings.
        </p>
      ) : null}
    </dl>
  );
}

/**
 * Correct what a Partner is owed. The ledger is append-only, so a correction is a new entry
 * with a reason, picked up by the next payout run. Saved only after a review of the balance
 * before and after.
 */
export function LedgerAdjustment({
  onStepUpRequired,
}: {
  onStepUpRequired: (reason: string) => void;
}) {
  const adjust = useLedgerAdjustment();
  const [partner, setPartner] = useState<PickedPartner | null>(null);
  const partnerId = partner?.id ?? "";
  const [direction, setDirection] = useState<Direction>("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const paise = correctionPaise(direction, amount);
  const amountInvalid = amount.trim() !== "" && paise === null;

  const missing = [
    partnerId === "" ? "a partner" : null,
    paise === null ? "an amount" : null,
    reason.trim() === "" ? "a reason" : null,
  ].filter((item): item is string => item !== null);
  const ready = missing.length === 0;

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">
        Correct a partner&apos;s balance
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Add money a partner is owed, or take back an overpayment. The next
        payout run includes it. Entries are never edited, only added.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <PartnerPicker value={partner} onChange={setPartner} />

        <ChoiceChips
          label="What do you want to do?"
          name="ledger-correction-direction"
          layout="wrap"
          options={DIRECTIONS}
          value={direction}
          onChange={(next) => setDirection(next as Direction)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Amount ₹"
            required
            error={amountInvalid ? "Enter an amount in rupees, like 500 or 499.50." : undefined}
          >
            <Input
              inputMode="decimal"
              value={amount}
              placeholder="500"
              onChange={(event) => setAmount(event.target.value.replace(/^-/, ""))}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-2" aria-label="Quick amounts">
            {QUICK_AMOUNTS.map((rupees) => (
              <Button
                key={rupees}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAmount(String(rupees))}
              >
                {formatMoney(rupees * 100)}
              </Button>
            ))}
          </div>
        </div>

        {partner ? <BalanceChange partnerId={partnerId} paise={paise} /> : null}

        <Field
          label="Reason"
          required
          description="Kept with the entry for audit. Pick one, then add a job or date if it helps."
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" aria-label="Suggested reasons">
              {SUGGESTED_REASONS[direction].map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  size="sm"
                  variant={reason.trim() === suggestion ? "primary" : "outline"}
                  onClick={() => setReason(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
            <Textarea
              value={reason}
              maxLength={240}
              placeholder="For example: Missed earning for the 12 Nov cleaning job"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!ready}
          onClick={() => {
            adjust.reset();
            setReviewing(true);
          }}
        >
          {paise === null
            ? "Review correction…"
            : direction === "add"
              ? `Review: add ${formatMoney(paise)}…`
              : `Review: take back ${formatMoney(-paise)}…`}
        </Button>
        {!ready ? (
          <p className="text-sm text-text-secondary">
            Still needed: {missing.join(", ")}.
          </p>
        ) : null}
      </div>
      {reviewing && paise !== null && partner ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !adjust.isPending) setReviewing(false);
          }}
          title={
            paise > 0
              ? `Add ${formatMoney(paise)}?`
              : `Recover ${formatMoney(-paise)}?`
          }
          description={`${partner.display_name}. The entry is permanent; a mistake is fixed with another correction.`}
          footer={
            <>
              <Button
                variant="outline"
                disabled={adjust.isPending}
                onClick={() => setReviewing(false)}
              >
                Back
              </Button>
              <Button
                loading={adjust.isPending}
                loadingLabel="Saving"
                onClick={() =>
                  adjust.mutate(
                    {
                      partner_id: partnerId,
                      net_paise: paise ?? 0,
                      reason: reason.trim(),
                      // One key per distinct request: the same form sent twice is one correction.
                      idempotencyKey: getStableIdempotencyKey(
                        `ledger-adjustment:${partnerId}:${paise}:${reason.trim()}:${saved}`,
                      ),
                    },
                    {
                      onSuccess: () => {
                        setAmount("");
                        setReason("");
                        setSaved((count) => count + 1);
                        setReviewing(false);
                      },
                      onError: (error) => {
                        setReviewing(false);
                        if (isStepUpRequired(error)) {
                          onStepUpRequired(
                            "Your confirmation lapsed. The balance was not changed.",
                          );
                        }
                      },
                    },
                  )
                }
              >
                {paise > 0
                  ? `Add ${formatMoney(paise)}`
                  : `Recover ${formatMoney(-paise)}`}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <BalanceChange partnerId={partnerId} paise={paise} />
            <p className="text-text-secondary">Reason: {reason.trim()}</p>
          </div>
        </Dialog>
      ) : null}
      {adjust.isSuccess ? (
        <p className="mt-2 text-sm text-success-text">
          Saved. {formatMoney(Math.abs(adjust.data.net_paise))}{" "}
          {adjust.data.net_paise > 0 ? "added" : "recovered"}.
        </p>
      ) : null}
      {adjust.isError && !isStepUpRequired(adjust.error) ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {friendlyErrorMessage(adjust.error)}
        </p>
      ) : null}
    </Card>
  );
}
