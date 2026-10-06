"use client";

import { Button, Card, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useState } from "react";

import { isStepUpRequired } from "@/features/finance/queries";

import { rupees, useAdjustCoins, useCustomerLedger } from "../queries";

function when(value?: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function CustomerLedgerPanel({ onStepUpRequired }: { onStepUpRequired: (reason: string) => void }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const ledger = useCustomerLedger(phone);
  const adjust = useAdjustCoins();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const amountValue = /^-?\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const data = ledger.data;

  return (
    <div className="grid gap-4">
      <Card padding="md">
        <p className="text-sm text-text-secondary">
          One customer&apos;s wallet, V Coins and referral history, with the booking and rule
          behind every entry.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Customer phone">
            <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+91…" />
          </Field>
          <Button onClick={() => setPhone(phoneInput.trim())} disabled={phoneInput.trim() === ""}>
            Look up
          </Button>
        </div>
      </Card>

      {phone === "" ? null : ledger.isPending ? (
        <Spinner />
      ) : ledger.isError || !data ? (
        <ErrorState severity="warning" title="Customer not found" message="Check the phone number." />
      ) : (
        <>
          <Card padding="md">
            <h2 className="text-sm font-semibold">{data.phone_number}</h2>
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
              <div>Wallet available: {rupees(data.wallet_available_paise)}</div>
              <div>Wallet held at checkout: {rupees(data.wallet_reserved_paise)}</div>
              <div>Referral code: {data.referral_code || "—"}</div>
              <div>Spendable coins: {data.coins.spendable_coins ?? 0}</div>
              <div>Pending coins: {data.coins.pending_coins ?? 0}</div>
              <div>Locked coins: {data.coins.locked_coins ?? 0}</div>
            </dl>
            <p className="mt-2 text-sm">
              {data.referred_by
                ? `Referred by ${data.referred_by.referrer_phone} (${data.referred_by.status})`
                : "Not referred by anyone."}{" "}
              Has referred {data.referrals_made.length} customer(s).
            </p>
          </Card>

          <Card padding="md">
            <h2 className="text-sm font-semibold">Add or deduct coins</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Positive adds coins, negative deducts spendable coins. The reason and your number are
              saved on the ledger entry.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Coins (e.g. 200 or -200)">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Reason" className="min-w-64 flex-1">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                loading={adjust.isPending}
                disabled={!amountValue || reason.trim() === ""}
                onClick={() =>
                  adjust.mutate(
                    { customer_id: data.customer_id, amount: amountValue ?? 0, reason: reason.trim() },
                    {
                      onSuccess: () => {
                        setAmount("");
                        setReason("");
                      },
                      onError: (error) => {
                        if (isStepUpRequired(error)) {
                          onStepUpRequired("Your confirmation lapsed. No coins were changed.");
                        }
                      },
                    },
                  )
                }
              >
                Save adjustment
              </Button>
            </div>
            {adjust.isError && !isStepUpRequired(adjust.error) ? (
              <ErrorState inline className="mt-2" severity="warning" title="Not saved" message="A deduction cannot exceed the spendable coins." />
            ) : null}
          </Card>

          <Card padding="md">
            <h2 className="text-sm font-semibold">V Coins ledger</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-text-muted">
                  <tr>
                    <th className="py-1 pr-3">When</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Coins</th>
                    <th className="py-1 pr-3">Source</th>
                    <th className="py-1 pr-3">Rule</th>
                    <th className="py-1">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coin_transactions.map((txn) => (
                    <tr key={txn.id} className="border-t border-border">
                      <td className="py-1 pr-3 whitespace-nowrap">{when(txn.created_at)}</td>
                      <td className="py-1 pr-3">
                        {txn.kind}
                        {txn.status && txn.status !== "CAPTURED" ? ` (${txn.status.toLowerCase()})` : ""}
                      </td>
                      <td className="py-1 pr-3" data-numeric>{txn.amount}</td>
                      <td className="py-1 pr-3">
                        {txn.source_type ? `${txn.source_type} ${txn.source_id?.slice(0, 8) ?? ""}` : "—"}
                      </td>
                      <td className="py-1 pr-3">{txn.rule_name || "—"}</td>
                      <td className="py-1">{txn.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padding="md">
            <h2 className="text-sm font-semibold">Wallet ledger</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-text-muted">
                  <tr>
                    <th className="py-1 pr-3">When</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Amount</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Order</th>
                    <th className="py-1">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wallet_transactions.map((txn) => (
                    <tr key={txn.id} className="border-t border-border">
                      <td className="py-1 pr-3 whitespace-nowrap">{when(txn.created_at)}</td>
                      <td className="py-1 pr-3">{txn.kind}</td>
                      <td className="py-1 pr-3" data-numeric>{rupees(txn.amount_paise)}</td>
                      <td className="py-1 pr-3">{txn.status}</td>
                      <td className="py-1 pr-3">{txn.order_id?.slice(0, 8) ?? "—"}</td>
                      <td className="py-1">{txn.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
