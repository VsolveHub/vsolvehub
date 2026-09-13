"use client";

import { useState, useEffect } from "react";
import { 
  Tag, Plus, Percent, CheckCircle2, Calendar, 
  Search, RefreshCw, X, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface PromoCode {
  id: string;
  code: string;
  discount_type: "PERCENTAGE" | "FLAT";
  discount_value: number;
  min_order_inr: number;
  used_count: number;
  is_active: boolean;
}

interface GrowthResponse {
  coupons?: PromoCode[];
}

export default function MarketingCampaignsPage() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FLAT">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(20);
  const [minOrder, setMinOrder] = useState(499);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadPromos() {
    setLoading(true);
    try {
      const data = await adminFetch<GrowthResponse>("/api/v1/admin/growth/");
      setPromos(data.coupons || []);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load marketing coupons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPromos();
  }, []);

  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await adminFetch("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_COUPON",
          code: newCode.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: discountValue,
          min_order_inr: minOrder,
        }),
      });

      setIsModalOpen(false);
      setNewCode("");
      setSuccessMsg(`Coupon code successfully created and persisted to database.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadPromos();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create coupon code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §30 GROWTH
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Marketing & Promotional Campaign Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Author discount promo vouchers, student perks, festive flash sales, budget limits, and target audience restrictions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Promo Code
        </button>
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

      {/* Promos Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Coupon Code</th>
              <th className="px-5 py-3.5">Discount Benefit</th>
              <th className="px-5 py-3.5">Basket Minimum</th>
              <th className="px-5 py-3.5">Redemption Count</th>
              <th className="px-5 py-3.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Loading marketing coupons from database...
                </td>
              </tr>
            ) : promos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                  No promotional coupons created yet. Click &quot;Create Promo Code&quot; to launch a campaign.
                </td>
              </tr>
            ) : (
              promos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-mono font-bold text-[#0B192C]">
                    {p.code}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-emerald-700">
                    {p.discount_type === "PERCENTAGE" ? `${p.discount_value}% OFF` : `₹${p.discount_value} FLAT`}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-gray-700 text-xs">
                    Min ₹{p.min_order_inr}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-600 font-mono">
                    {p.used_count} redemptions
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {p.is_active ? "Active" : "Paused"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateCoupon} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">Create Promo Code</h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Coupon Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., FESTIVE30"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border rounded-lg font-mono font-bold text-sm uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat INR (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Value</label>
                  <input
                    type="number"
                    min="1"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Minimum Order Basket (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={minOrder}
                  onChange={(e) => setMinOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Promo Code"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
