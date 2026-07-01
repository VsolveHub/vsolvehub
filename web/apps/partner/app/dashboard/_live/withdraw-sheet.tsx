"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Banknote, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import { Medallion } from "@/components/graphics";
import { inr } from "@/lib/format";
import { savePayoutDetails, withdrawBalance, type PayoutState } from "./payout-actions";

export function WithdrawSheet({
  balance,
  bankLast4,
  onClose,
}: {
  balance: number;
  bankLast4: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PayoutState, FormData>(savePayoutDetails, {});
  const [done, setDone] = useState(false);
  const [withdrawn, setWithdrawn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Withdraw the available balance and remember the ACTUAL amount paid out, so
  // the success screen shows the real figure (the live balance is now zero).
  async function doWithdraw() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await withdrawBalance(balance);
    setBusy(false);
    if ("amountPaise" in res && typeof res.amountPaise === "number") {
      setWithdrawn(Math.round(res.amountPaise / 100));
      setDone(true);
      router.refresh();
    } else {
      setError(res.error ?? "Withdrawal failed. Please try again.");
    }
  }

  // First-time flow: once payout details are saved, do the actual withdrawal.
  useEffect(() => {
    if (state.ok && !done && !busy) void doWithdraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const linked = Boolean(bankLast4);

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="vsh-slideup relative max-h-full w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400" aria-label="Close">
          <X className="h-5 w-5" />
        </button>

        {done ? (
          <div className="py-4 text-center">
            <Medallion icon={CheckCircle2} tone="green" size={64} className="mx-auto" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">Withdrawal requested</h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-sm text-gray-500">
              {inr(withdrawn)} is on its way to your account. Payouts usually land within 24 hours.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : linked ? (
          <div className="py-2">
            <p className="text-xs uppercase tracking-wide text-gray-400">Withdraw</p>
            <p className="text-3xl font-bold text-ink-900">{inr(balance)}</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface-muted p-3.5">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-green-600">
                <Banknote className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">Bank ····{bankLast4}</p>
                <p className="text-[11px] text-gray-500">Linked account</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <button
              onClick={doWithdraw}
              disabled={busy || balance <= 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Processing…" : <>Withdraw {inr(balance)} <ArrowRight className="h-4 w-4" /></>}
            </button>
            {error ? <p className="mt-2 text-center text-sm text-danger">{error}</p> : null}
          </div>
        ) : (
          <form action={action} className="py-2">
            <Medallion icon={Banknote} tone="brand" size={52} />
            <h3 className="mt-3 text-lg font-bold text-ink-900">Add payout details</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tell us where to send your {inr(balance)}. We only ask this the first time you withdraw.
            </p>

            <div className="mt-4 space-y-3">
              <Input name="account" label="Bank account number" placeholder="Account number" inputMode="numeric" />
              <Input name="ifsc" label="IFSC code" placeholder="HDFC0001234" />
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
              </div>
              <Input name="upiId" label="UPI ID" placeholder="name@upi" />
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Encrypted at rest. Only the last 4 digits are shown.
            </p>

            {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? "Saving…" : `Save & withdraw ${inr(balance)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Input({
  name,
  label,
  placeholder,
  inputMode,
}: {
  name: string;
  label: string;
  placeholder: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
