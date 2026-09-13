"use client";

import { useState, useEffect } from "react";
import { 
  Percent, Sliders, CheckCircle2, Search, 
  Layers, Plus, RefreshCw, AlertCircle, ArrowUpRight 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface CommissionRule {
  id: string;
  category: string;
  type: string;
  rate: string;
  slab_notes: string;
  gst_applicable: boolean;
  is_active: boolean;
}

export default function CommissionRulesPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newType, setNewType] = useState("PERCENTAGE");
  const [newRate, setNewRate] = useState("10.0%");
  const [newNotes, setNewNotes] = useState("");
  const [newGst, setNewGst] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadRules() {
    setLoading(true);
    setActionError(null);
    try {
      const data = await adminFetch<{ commission_rules: CommissionRule[] }>("/api/v1/admin/commission-rules/");
      setRules(data.commission_rules || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load commission rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    try {
      await adminFetch("/api/v1/admin/commission-rules/", {
        method: "POST",
        data: {
          category: newCategory,
          type: newType,
          rate: newRate,
          slab_notes: newNotes,
          gst_applicable: newGst,
        },
      });
      setActionSuccess(`Commission rule for "${newCategory}" successfully created.`);
      setIsAdding(false);
      setNewCategory("");
      setNewNotes("");
      await loadRules();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || "Failed to create commission rule.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              MONEY & CLEARINGHOUSE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Platform Fee & Take-Rate Slabs
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configurable revenue take-rates across categories: percentage fees, commission caps, daily shift wages, and GST eligibility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Commission Slab
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
              <th className="px-5 py-3.5">Category / Vertical</th>
              <th className="px-5 py-3.5">Fee Type</th>
              <th className="px-5 py-3.5">Platform Rate</th>
              <th className="px-5 py-3.5">Slab Breakdown & Thresholds</th>
              <th className="px-5 py-3.5">GST 18%</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Connecting to Platform Fee Engine...
                </td>
              </tr>
            ) : rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  No commission rules configured.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[#0B192C]">
                    {r.category}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs font-semibold text-gray-700">
                    {r.type}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-[#FF6500]">
                    {r.rate}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-600">
                    {r.slab_notes || "Flat take-rate applies to all order sizes."}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.gst_applicable ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {r.gst_applicable ? "GST Applicable" : "Exempt"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      r.is_active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}>
                      {r.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Commission Rule Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form onSubmit={handleAddRule} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-[#0B192C]">Add Take-Rate Slab</h3>
              <button type="button" onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Category Title *</label>
                <input required type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. Appliance Repair" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Fee Type</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    <option value="PERCENTAGE">PERCENTAGE</option>
                    <option value="COMMISSION_CAP">COMMISSION_CAP</option>
                    <option value="SLAB_BASED">SLAB_BASED</option>
                    <option value="PER_WORKER_DAY">PER_WORKER_DAY</option>
                    <option value="LISTING_FEE">LISTING_FEE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Rate String *</label>
                  <input required type="text" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="e.g. 12.5% or Rs 50/day" className="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Slab Breakdown & Notes</label>
                <textarea rows={2} value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="e.g. Tier 1: 15%, Tier 2: 10%" className="w-full px-3 py-2 border rounded-lg text-xs" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="gst_rule" checked={newGst} onChange={e => setNewGst(e.target.checked)} className="rounded text-[#FF6500]" />
                <label htmlFor="gst_rule" className="text-xs font-semibold text-gray-700 cursor-pointer">
                  Standard 18% GST Applicable on Disbursals
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm rounded-lg bg-[#FF6500] hover:bg-[#E35B00] text-white font-semibold cursor-pointer">
                {isSubmitting ? "Creating..." : "Save Commission Rule"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
