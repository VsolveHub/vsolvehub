"use client";

import { useState, useEffect } from "react";
import { 
  IndianRupee, Sliders, CheckCircle2, Search, 
  Layers, Plus, RefreshCw, ChevronRight, Zap, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface PricingModel {
  id: string;
  name: string;
  formula: string;
  applicable_to: string;
  base_rate_inr?: number;
  surge_multiplier?: number;
  is_active: boolean;
}

export default function PricingEnginePage() {
  const [models, setModels] = useState<PricingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<PricingModel | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormula, setNewFormula] = useState("");
  const [newApplicable, setNewApplicable] = useState("");
  const [newBaseRate, setNewBaseRate] = useState("299");
  const [newSurge, setNewSurge] = useState("1.25");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadPricing() {
    setLoading(true);
    try {
      const data = await adminFetch<{ pricing_models: PricingModel[] }>("/api/v1/admin/pricing-matrix/");
      setModels(data.pricing_models || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load pricing models");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, []);

  async function handleAddFormula(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    try {
      await adminFetch("/api/v1/admin/pricing-matrix/", {
        method: "POST",
        data: {
          name: newName,
          formula: newFormula,
          applicable_to: newApplicable || "General Services",
          base_rate_inr: parseFloat(newBaseRate) || 0,
          surge_multiplier: parseFloat(newSurge) || 1.0,
        },
      });
      setActionSuccess(`Formula "${newName}" saved and deployed.`);
      setIsAddingNew(false);
      setNewName("");
      setNewFormula("");
      setNewApplicable("");
      await loadPricing();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || "Failed to save formula");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateRates(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModel) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await adminFetch("/api/v1/admin/pricing-matrix/", {
        method: "PATCH",
        data: {
          id: selectedModel.id,
          base_rate_inr: selectedModel.base_rate_inr || 0,
          surge_multiplier: selectedModel.surge_multiplier || 1.0,
          is_active: selectedModel.is_active,
        },
      });
      setActionSuccess(`Rates updated for "${selectedModel.name}".`);
      setSelectedModel(null);
      await loadPricing();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || "Failed to update rates");
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
              MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Dynamic Pricing Matrix & Calculation Engine
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Zero-hardcoded mathematical pricing models: distance, hourly duration, daily shifts, sq.ft, kg, unit counts, and night surcharges.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddingNew(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Custom Formula
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Live Active Models</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">{models.filter(m => m.is_active).length} Active</p>
          <span className="text-xs text-emerald-600 font-medium">Persisted in PostgreSQL database</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Dynamic Surge Multipliers</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">Configurable</p>
          <span className="text-xs text-gray-500">Night, Rain, Emergency Surcharges</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Database Records</span>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{models.length} Total</p>
          <span className="text-xs text-gray-500">Audited via Django REST</span>
        </div>
      </div>

      {/* Pricing Models Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 py-12 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
            Connecting to Pricing Matrix...
          </div>
        ) : (
          models.map((m, idx) => (
            <div
              key={m.id}
              className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 hover:border-[#FF6500]/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-gray-400">#Model 0{idx + 1}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    m.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {m.is_active ? "Active" : "Disabled"}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#0B192C] mt-2">
                  {m.name}
                </h3>
                <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100 font-mono text-xs text-gray-800 font-semibold">
                  {m.formula}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-600 bg-warm-50 p-2 rounded-md">
                  <span>Base: <strong>₹{m.base_rate_inr ?? 0}</strong></span>
                  <span>Surge: <strong>{m.surge_multiplier ?? 1.0}x</strong></span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  <strong>Verticals:</strong> {m.applicable_to}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedModel(m)}
                  className="text-xs font-semibold text-[#FF6500] hover:text-[#E35B00] flex items-center gap-1 cursor-pointer"
                >
                  Configure Rates <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add New Formula Modal */}
      {isAddingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form onSubmit={handleAddFormula} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-[#0B192C]">Add Custom Pricing Formula</h3>
              <button type="button" onClick={() => setIsAddingNew(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Model Name *</label>
                <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Peak Surge Multiplier" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mathematical Formula Expression *</label>
                <input required type="text" value={newFormula} onChange={e => setNewFormula(e.target.value)} placeholder="e.g. Base Rate * 1.5 + Waiting Surcharge" className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Applicable Verticals</label>
                <input type="text" value={newApplicable} onChange={e => setNewApplicable(e.target.value)} placeholder="e.g. Electrician, Cab, Plumbing" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Base Rate (INR)</label>
                  <input type="number" value={newBaseRate} onChange={e => setNewBaseRate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Surge Multiplier</label>
                  <input type="number" step="0.05" value={newSurge} onChange={e => setNewSurge(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setIsAddingNew(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm rounded-lg bg-[#FF6500] hover:bg-[#E35B00] text-white font-semibold cursor-pointer">
                {isSubmitting ? "Deploying..." : "Deploy Formula"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Model Configuration Modal */}
      {selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form onSubmit={handleUpdateRates} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-[#0B192C]">
                Configure Rates: {selectedModel.name}
              </h3>
              <button type="button" onClick={() => setSelectedModel(null)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <p><strong>Formula Expression:</strong> <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">{selectedModel.formula}</code></p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Base Component Rate (INR)</label>
                <input 
                  type="number" 
                  value={selectedModel.base_rate_inr ?? 0} 
                  onChange={e => setSelectedModel({ ...selectedModel, base_rate_inr: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Surge Multiplier</label>
                <input 
                  type="number" 
                  step="0.05" 
                  value={selectedModel.surge_multiplier ?? 1.0} 
                  onChange={e => setSelectedModel({ ...selectedModel, surge_multiplier: parseFloat(e.target.value) || 1.0 })}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono" 
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="is_active_toggle" 
                  checked={selectedModel.is_active} 
                  onChange={e => setSelectedModel({ ...selectedModel, is_active: e.target.checked })}
                  className="rounded text-[#FF6500] focus:ring-[#FF6500]"
                />
                <label htmlFor="is_active_toggle" className="text-xs font-semibold text-gray-700 cursor-pointer">
                  Model is Active and Eligible for Live Booking Calculations
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setSelectedModel(null)} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm rounded-lg bg-[#FF6500] hover:bg-[#E35B00] text-white font-semibold cursor-pointer">
                {isSubmitting ? "Saving..." : "Save Pricing Rule"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
