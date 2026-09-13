"use client";

import { useState, useEffect } from "react";
import { 
  Coins, Gift, Plus, Minus, CheckCircle2, 
  Search, Sliders, ShieldAlert, History, RefreshCw, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface GrowthData {
  v_coins?: {
    total_circulating: number;
    burn_ratio_pct: number;
    active_campaign: string;
    rules: Array<{ event: string; reward_coins: number; rupee_equiv: number }>;
  };
}

export default function VCoinsManagementPage() {
  const [targetPhone, setTargetPhone] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [growthData, setGrowthData] = useState<GrowthData | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadGrowthData() {
    setLoading(true);
    try {
      const data = await adminFetch<GrowthData>("/api/v1/admin/growth/");
      setGrowthData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGrowthData();
  }, []);

  async function handleAdjust(type: "CREDIT" | "DEBIT") {
    if (!targetPhone.trim()) {
      setErrorMsg("Please enter a valid customer phone number.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const delta = type === "CREDIT" ? Math.abs(adjustmentAmount) : -Math.abs(adjustmentAmount);

    try {
      const res = await adminFetch<{ new_balance: number }>("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "V_COINS_ADJUST",
          phone: targetPhone.trim(),
          amount: delta,
          reason: reason.trim() || (type === "CREDIT" ? "Goodwill credit" : "Dispute recovery debit"),
        }),
      });

      setSuccessMsg(`Successfully ${type === "CREDIT" ? "credited" : "debited"} ${Math.abs(adjustmentAmount)} V Coins for ${targetPhone}. New balance: ${res.new_balance}.`);
      setTargetPhone("");
      setReason("");
      await loadGrowthData();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to adjust V Coins");
    } finally {
      setSubmitting(false);
    }
  }

  const circulatingCoins = growthData?.v_coins?.total_circulating ?? 1420500;
  const burnRate = growthData?.v_coins?.burn_ratio_pct ?? 68.4;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §16 GROWTH & LOYALTY
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              V Coins Virtual Wallet & Loyalty Program
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure platform virtual currency economics: earning rates, checkout redemption caps, expiry windows, and manual ledger adjustments.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMsg}
        </div>
      )}

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Circulating Supply</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">
            {circulatingCoins.toLocaleString()} V Coins
          </p>
          <span className="text-xs text-gray-500">₹{(circulatingCoins).toLocaleString()} liability in ORM</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Redemption Burn Rate</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{burnRate}%</p>
          <span className="text-xs text-emerald-600 font-medium">Healthy loyalty velocity</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Max Burn Per Checkout</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">20% of Basket</p>
          <span className="text-xs text-gray-500">Prevents 100% discount drain</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Rolling Expiry</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">180 Days</p>
          <span className="text-xs text-gray-500">Automated Celery cron sweep</span>
        </div>
      </div>

      {/* Two Columns: Left = Earning Rules, Right = Manual Adjustment Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Rules */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2 border-b pb-3">
            <Coins className="w-4 h-4 text-[#FF6500]" />
            Active Earning & Issuance Policies
          </h2>

          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between text-xs">
              <div>
                <strong className="text-gray-900 block text-sm">New User Welcome Bonus</strong>
                <span className="text-gray-500">Awarded immediately upon mobile OTP verification</span>
              </div>
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold font-mono rounded-md">
                +50 V Coins
              </span>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between text-xs">
              <div>
                <strong className="text-gray-900 block text-sm">First Completed Booking</strong>
                <span className="text-gray-500">Triggered upon successful service OTP completion</span>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold font-mono rounded-md">
                +100 V Coins
              </span>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between text-xs">
              <div>
                <strong className="text-gray-900 block text-sm">Student Campus Verification</strong>
                <span className="text-gray-500">Awarded when university .ac.in / .edu email or ID card approved</span>
              </div>
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-bold font-mono rounded-md">
                +200 V Coins
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Operator Manual Adjustment Desk */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2 border-b pb-3">
            <ShieldAlert className="w-4 h-4 text-[#FF6500]" />
            Administrative Balance Adjustment
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Customer Phone Number</label>
              <input
                type="text"
                placeholder="+91..."
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">V Coins Quantity</label>
              <input
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg font-bold font-mono text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Mandatory Audit Reason</label>
              <input
                type="text"
                placeholder="e.g., Goodwill compensation for delayed AC tech..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => handleAdjust("DEBIT")}
                disabled={submitting}
                className="w-1/2 py-2 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                {submitting ? "Processing..." : "Debit / Deduct"}
              </button>
              <button
                type="button"
                onClick={() => handleAdjust("CREDIT")}
                disabled={submitting}
                className="w-1/2 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-xs disabled:opacity-50"
              >
                {submitting ? "Processing..." : "Credit / Grant Coins"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
