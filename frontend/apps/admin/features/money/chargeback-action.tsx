"use client";

import { useState } from "react";
import Link from "next/link";
import { describeError } from "@vsolve/query";
import { Button, Dialog, ErrorState, Field, Input, formatMoney } from "@vsolve/ui";

import { chargebackAmountPaise } from "@/features/m2-cases/model/money";
import { useRecordChargeback } from "@/features/m2-cases/queries";

/**
 * The charges the chargeback command accepts: the crew booking fee, the quote unlock and the
 * visit plan. The labels are the server's own (`apps/requirements/ops_money.py`), and the server
 * still refuses anything else, so this only decides where the button is offered. Exported for
 * tests.
 */
const CHARGEBACK_ITEMS = ["Crew booking fee", "Quote unlock", "Visit plan"];

export function canRecordChargeback(row: { item: string; status: string }): boolean {
  return (
    row.status !== "FAILED" &&
    CHARGEBACK_ITEMS.some((label) => row.item === label || row.item.startsWith(`${label}:`))
  );
}

/**
 * "The bank reversed this payment": one button on the payment row, so nobody has to find or
 * paste a payment id. Recording it opens a Chargeback case, which holds the vendor's money until
 * the case is decided.
 */
export function ChargebackAction({ paymentId, amountPaise }: { paymentId: string; amountPaise: number }) {
  const record = useRecordChargeback();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(amountPaise / 100));
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const paise = chargebackAmountPaise(amount);
  const ready = paise !== null && paise > 0 && reference.trim() !== "" && reason.trim() !== "";

  if (record.isSuccess && record.data) {
    return (
      <Link
        href={`/operations/cases?case=${record.data.id}`}
        className="whitespace-nowrap text-xs font-semibold text-text-link hover:underline"
      >
        Open chargeback case
      </Link>
    );
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Bank reversed it
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (record.isPending ? undefined : setOpen(next))}
        dismissable={!record.isPending}
        title="Record a chargeback"
        description="The customer's bank took this payment back. This opens a Chargeback case and holds the vendor's money until you decide it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={record.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!ready}
              loading={record.isPending}
              loadingLabel="Recording"
              onClick={() => {
                if (paise === null) return;
                record.mutate(
                  {
                    paymentAttemptId: paymentId,
                    amountPaise: paise,
                    providerReference: reference.trim(),
                    reasonCode: reason.trim(),
                  },
                  { onSuccess: () => setOpen(false) },
                );
              }}
            >
              {paise ? `Record ${formatMoney(paise)}` : "Record"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {record.isError ? (
            <ErrorState inline title="Not recorded" message={describeError(record.error).message} />
          ) : null}
          <Field label="Amount reversed (₹)" description="As written on the bank's notice.">
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Bank reference">
            <Input value={reference} onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Reason code" description="For example, fraud or service not received.">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
