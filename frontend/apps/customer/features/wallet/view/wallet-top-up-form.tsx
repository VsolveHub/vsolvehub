"use client";

import { Button, formatMoney, useToast } from "@vsolve/ui";
import { CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import {
  useInitiateWalletTopUp,
  walletKeys,
  type WalletAccount,
  type WalletTopUpResponse,
} from "../queries";

interface WalletTopUpFormProps {
  wallet: WalletAccount;
}

function policyLimit(policy: Record<string, number> | undefined, key: string): number | null {
  const value = policy?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function WalletTopUpForm({ wallet }: WalletTopUpFormProps) {
  const policy = wallet.top_up_policy;
  const minPaise = policyLimit(policy, "min_top_up_paise");
  const maxPaise = policyLimit(policy, "max_top_up_paise");
  const limitsPublished = minPaise != null && maxPaise != null && minPaise <= maxPaise;

  const queryClient = useQueryClient();
  const toast = useToast();
  const [amountPaise, setAmountPaise] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [createdAttempt, setCreatedAttempt] = useState<WalletTopUpResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);

  const topUpMutation = useInitiateWalletTopUp();

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) {
      setAmountPaise(Math.round(num * 100));
      setErrorMessage(null);
      return;
    }
    setAmountPaise(null);
  };

  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: walletKeys.detail });
    void queryClient.invalidateQueries({ queryKey: walletKeys.transactions });
  };

  const finishLocalOrCheckout = async (attempt: WalletTopUpResponse) => {
    setIsHandingOff(true);
    setErrorMessage(null);
    try {
      const result = await completeOrOpenCheckout(attempt.payment_attempt_id, {
        businessName: "Vsolve Hub",
        onAwaitingCapture: () =>
          toast.notify("Complete payment in Razorpay. Wallet updates when capture is confirmed."),
      });

      if (result.mode === "simulated") {
        setCreatedAttempt(null);
        topUpMutation.reset();
        setCustomInput("");
        setAmountPaise(null);
        refreshWallet();
        toast.notify(
          `${formatMoney(attempt.amount_paise)} added to your wallet. Razorpay isn’t configured, so this was recorded here.`,
        );
        return;
      }

      setCreatedAttempt(attempt);
      if (result.mode === "pending") {
        toast.notify("Top-up started. Payment is still preparing — try again in a moment.");
      } else {
        toast.notify("Payment submitted. Waiting for Razorpay capture to credit your wallet.");
        refreshWallet();
      }
    } catch (err) {
      setCreatedAttempt(attempt);
      setErrorMessage(err instanceof Error ? err.message : "Could not open payment");
    } finally {
      setIsHandingOff(false);
    }
  };

  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!limitsPublished || minPaise == null || maxPaise == null) {
      setErrorMessage("Top-up limits are not published yet.");
      return;
    }
    if (amountPaise == null) {
      setErrorMessage("Enter an amount to add.");
      return;
    }
    if (amountPaise < minPaise) {
      setErrorMessage(`Minimum top-up amount is ${formatMoney(minPaise)}`);
      return;
    }
    if (amountPaise > maxPaise) {
      setErrorMessage(`Maximum top-up limit is ${formatMoney(maxPaise)}`);
      return;
    }

    topUpMutation.mutate(
      { amount_paise: amountPaise },
      {
        onSuccess: (data) => {
          void finishLocalOrCheckout(data);
        },
        onError: (err: unknown) => {
          setErrorMessage(err instanceof Error ? err.message : "Failed to initiate top-up");
        },
      },
    );
  };

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      <div className="border-b border-[#eee9e0] pb-4">
        <h2 className="text-lg font-bold text-navy-900">Add money</h2>
        <p className="text-xs text-text-secondary">
          Prepaid balance for bookings only. It cannot be withdrawn.
        </p>
        {limitsPublished ? (
          <p className="mt-1 text-xs text-text-secondary">
            Min {formatMoney(minPaise)} • Max {formatMoney(maxPaise)} per add
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-800">
            Top-up limits are not published yet. Add money once Operations publishes them.
          </p>
        )}
      </div>

      {createdAttempt ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-900">
                Razorpay checkout: {formatMoney(createdAttempt.amount_paise)}
              </h3>
              <p className="mt-1 text-xs text-emerald-800">
                Finish this top-up in Razorpay. The balance updates when the payment is captured.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  className="text-xs h-9 px-3"
                  disabled={isHandingOff}
                  loading={isHandingOff}
                  loadingLabel="Opening…"
                  onClick={() => void finishLocalOrCheckout(createdAttempt)}
                >
                  Open Razorpay again
                </Button>
                <Button
                  variant="outline"
                  className="text-xs h-9 px-3"
                  onClick={() => setCreatedAttempt(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleTopUpSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="wallet-custom-amount"
              className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5"
            >
              Amount (₹)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-base font-bold text-navy-900">
                ₹
              </span>
              <input
                id="wallet-custom-amount"
                type="number"
                min={limitsPublished && minPaise != null ? minPaise / 100 : undefined}
                max={limitsPublished && maxPaise != null ? maxPaise / 100 : undefined}
                value={customInput}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder={limitsPublished && minPaise != null ? String(minPaise / 100) : ""}
                disabled={!limitsPublished}
                className="w-full rounded-xl border border-[#e7e2da] bg-white py-2.5 pl-8 pr-4 text-sm font-bold text-navy-900 placeholder:text-text-muted focus:border-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 disabled:bg-[#FAF9F7]"
              />
            </div>
          </div>

          {errorMessage && (
            <p className="text-xs font-medium text-rose-600">{errorMessage}</p>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full bg-[#EA580C] hover:bg-[#d65f1a] text-white py-3 rounded-xl font-bold text-sm shadow-sm transition-transform active:scale-[0.99]"
              disabled={
                !limitsPublished ||
                amountPaise == null ||
                topUpMutation.isPending ||
                isHandingOff
              }
            >
              {topUpMutation.isPending || isHandingOff
                ? "Opening payment…"
                : amountPaise != null
                  ? `Add ${formatMoney(amountPaise)}`
                  : "Add money"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
