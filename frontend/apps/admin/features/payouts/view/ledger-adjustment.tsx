"use client";

import { getStableIdempotencyKey } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Button,
  Card,
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

/** The partner's available balance now and after the correction. Mounted only with a partner. */
function BalanceChange({
  partnerId,
  paise,
}: {
  partnerId: string;
  paise: number;
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
        The current balance could not be read. The correction is still{" "}
        {formatMoney(Math.abs(paise))} {paise > 0 ? "added to" : "taken from"}{" "}
        what the partner is owed.
      </p>
    );
  }
  const before = activity.data.balance.available_paise;
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
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const paise = signedPaise(amount);

  const ready = partnerId !== "" && paise !== null && reason.trim() !== "";

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">
        Correct a partner&apos;s balance
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Positive adds to what the partner is owed (a missed earning). Negative
        takes it back (an overpayment). The next payout run includes it. Entries
        are never edited, only added.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <PartnerPicker value={partner} onChange={setPartner} />
        </div>
        <Field label="Amount ₹ (e.g. 500 or -500)" required>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Reason" required className="sm:col-span-2">
          <Textarea
            value={reason}
            maxLength={240}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button
          disabled={!ready}
          onClick={() => {
            adjust.reset();
            setReviewing(true);
          }}
        >
          Review correction…
        </Button>
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
