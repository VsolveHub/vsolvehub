"use client";

import { Button, formatMoney } from "@vsolve/ui";
import { ArrowRight, CheckCircle2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  useInitiateWalletTopUp,
  walletKeys,
  type WalletAccount,
  type WalletTopUpResponse,
} from "../queries";

interface WalletTopUpFormProps {
  wallet: WalletAccount;
}

const PRESET_AMOUNTS_PAISE = [20000, 50000, 100000, 200000]; // ₹200, ₹500, ₹1,000, ₹2,000

export function WalletTopUpForm({ wallet }: WalletTopUpFormProps) {
  const policy = wallet.top_up_policy || {};
  const minPaise = (policy["min_top_up_paise"] as number | undefined) ?? 10000; // ₹100
  const maxPaise = (policy["max_top_up_paise"] as number | undefined) ?? 1000000; // ₹10,000

  const queryClient = useQueryClient();
  const [amountPaise, setAmountPaise] = useState<number>(50000); // default ₹500
  const [customInput, setCustomInput] = useState<string>("500");
  const [createdAttempt, setCreatedAttempt] = useState<WalletTopUpResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const topUpMutation = useInitiateWalletTopUp();

  const handleSelectPreset = (paise: number) => {
    setAmountPaise(paise);
    setCustomInput((paise / 100).toString());
    setErrorMessage(null);
  };

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setAmountPaise(num * 100);
      setErrorMessage(null);
    }
  };

  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

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
          setCreatedAttempt(data);
        },
        onError: (err: unknown) => {
          setErrorMessage(err instanceof Error ? err.message : "Failed to initiate top-up");
        },
      },
    );
  };

  const handleSimulatePayment = async () => {
    if (!createdAttempt) return;
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      // simulate-capture is a dev-only endpoint not in the OpenAPI schema.
      // We call it via raw fetch, mirroring the session cookie the API client uses.
      const csrfMeta = typeof document !== "undefined"
        ? document.cookie.split(";").find(c => c.trim().startsWith("csrftoken="))?.split("=")[1]
        : undefined;
      const res = await fetch("/api/v1/commerce/payments/simulate-capture/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfMeta ? { "X-CSRFToken": csrfMeta } : {}),
        },
        body: JSON.stringify({ payment_attempt_id: createdAttempt.payment_attempt_id }),
      });
      if (!res.ok) {
        throw new Error("Simulation capture failed or is disabled in this environment.");
      }
      setCreatedAttempt(null);
      topUpMutation.reset();
      // Refresh wallet balance and transaction list now that payment captured
      void queryClient.invalidateQueries({ queryKey: walletKeys.detail });
      void queryClient.invalidateQueries({ queryKey: walletKeys.transactions });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Simulated capture failed");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-center justify-between border-b border-[#eee9e0] pb-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Add Money to Wallet</h2>
          <p className="text-xs text-text-secondary">
            Min {formatMoney(minPaise)} • Max {formatMoney(maxPaise)} per transaction
          </p>
        </div>
      </div>

      {createdAttempt ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-900">
                Top-Up Order Initiated: {formatMoney(createdAttempt.amount_paise)}
              </h3>
              <p className="mt-1 text-xs text-emerald-800">
                Attempt ID: <code className="font-mono text-[11px]">{createdAttempt.payment_attempt_id}</code>
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  className="bg-[#EA580C] hover:bg-[#d65f1a] text-white text-xs h-9 px-4 font-semibold"
                  disabled={isSimulating}
                  onClick={handleSimulatePayment}
                >
                  {isSimulating ? "Confirming..." : "Simulate Instant Payment (Dev)"}
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
                <Button
                  variant="outline"
                  className="text-xs h-9 px-3"
                  onClick={() => setCreatedAttempt(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleTopUpSubmit} className="mt-6 space-y-5">
          {/* Quick presets */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2.5">
              Quick Select
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {PRESET_AMOUNTS_PAISE.map((preset) => {
                const isSelected = amountPaise === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 px-3 text-sm font-semibold transition-all ${
                      isSelected
                        ? "border-[#EA580C] bg-orange-50/70 text-[#EA580C] shadow-xs"
                        : "border-[#e7e2da] bg-white text-navy-900 hover:border-slate-300 hover:bg-[#FAF9F7]"
                    }`}
                  >
                    <Plus className="size-3.5 opacity-60" />
                    <span>{formatMoney(preset)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label
              htmlFor="wallet-custom-amount"
              className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5"
            >
              Or Enter Custom Amount (₹)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-base font-bold text-navy-900">
                ₹
              </span>
              <input
                id="wallet-custom-amount"
                type="number"
                min={minPaise / 100}
                max={maxPaise / 100}
                value={customInput}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="500"
                className="w-full rounded-xl border border-[#e7e2da] bg-white py-2.5 pl-8 pr-4 text-sm font-bold text-navy-900 placeholder:text-text-muted focus:border-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20"
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
              disabled={topUpMutation.isPending}
            >
              {topUpMutation.isPending ? "Setting up top-up..." : `Proceed to Add ${formatMoney(amountPaise)}`}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
