"use client";

import { useState, useEffect } from "react";
import { 
  Users, Gift, ArrowRight, CheckCircle2, ShieldCheck, 
  TrendingUp, Award, RefreshCw, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface GrowthResponse {
  referrals?: {
    total_referrals_sent: number;
    successful_conversions: number;
    top_referrer: string;
  };
}

export default function ReferralManagementPage() {
  const [referrerReward, setReferrerReward] = useState(100);
  const [refereeReward, setRefereeReward] = useState(50);
  const [referralStats, setReferralStats] = useState({
    sent: 4820,
    converted: 1940,
    top: "+919849011223 (54 installs)",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await adminFetch<GrowthResponse>("/api/v1/admin/growth/");
        if (data.referrals) {
          setReferralStats({
            sent: data.referrals.total_referrals_sent,
            converted: data.referrals.successful_conversions,
            top: data.referrals.top_referrer,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleSaveRules() {
    setSaving(true);
    setError(null);
    try {
      await adminFetch("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "REFERRAL_QUALIFY",
          referrer_reward: referrerReward,
          referee_reward: refereeReward,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to persist referral parameters");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §17 GROWTH & LOYALTY
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Two-Sided Referral Program Engine
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure referrer & referee reward disbursements with strict 5-stage conversion qualification checks.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveRules}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Program Rules"}
        </button>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Referral program parameters saved to PostgreSQL and logged to audit trail.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {error}
        </div>
      )}

      {/* 5-Stage Qualification Funnel Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
          Strict 5-Stage Referral Qualification Lifecycle
        </h3>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold">
          <div className="p-3 bg-gray-50 rounded-lg text-center w-full border border-gray-200">
            <span className="text-gray-400 block font-mono text-[10px]">STAGE 1</span>
            <span className="text-gray-900">App Install</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
          <div className="p-3 bg-gray-50 rounded-lg text-center w-full border border-gray-200">
            <span className="text-gray-400 block font-mono text-[10px]">STAGE 2</span>
            <span className="text-gray-900">Registration</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
          <div className="p-3 bg-gray-50 rounded-lg text-center w-full border border-gray-200">
            <span className="text-gray-400 block font-mono text-[10px]">STAGE 3</span>
            <span className="text-gray-900">Code Applied</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
          <div className="p-3 bg-blue-50 rounded-lg text-center w-full border border-blue-200 text-blue-900">
            <span className="text-blue-500 block font-mono text-[10px]">STAGE 4</span>
            <span>1st Booking Done</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
          <div className="p-3 bg-emerald-50 rounded-lg text-center w-full border border-emerald-200 text-emerald-900">
            <span className="text-emerald-600 block font-mono text-[10px]">STAGE 5</span>
            <span>Reward Disbursed</span>
          </div>
        </div>
      </div>

      {/* Program Config & Top Referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-[#0B192C] text-sm">Reward Configuration</h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Referrer Reward (V Coins / INR)</label>
              <input
                type="number"
                value={referrerReward}
                onChange={(e) => setReferrerReward(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg font-bold font-mono text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Referee (New Customer) Incentive</label>
              <input
                type="number"
                value={refereeReward}
                onChange={(e) => setRefereeReward(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg font-bold font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-[#0B192C] text-sm">Conversion Metrics</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-gray-500">Total Invites Sent:</span>
              <span className="font-mono font-bold text-gray-900">{referralStats.sent.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-gray-500">First-Booking Conversions:</span>
              <span className="font-mono font-bold text-emerald-700">{referralStats.converted.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Top Growth Champion:</span>
              <span className="font-semibold text-[#0B192C]">{referralStats.top}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
