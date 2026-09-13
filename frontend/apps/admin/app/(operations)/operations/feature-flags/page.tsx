"use client";

import { useState, useEffect } from "react";
import { 
  Sliders, ToggleLeft, ToggleRight, CheckCircle2, 
  Plus, Search, ShieldCheck, RefreshCw, AlertCircle, X 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  is_enabled: boolean;
  rollout_percentage: number;
  target_city: string;
}

interface SystemHealthResponse {
  feature_flags?: FeatureFlag[];
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRollout, setNewRollout] = useState(100);
  const [newCity, setNewCity] = useState("ALL");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadFlags() {
    setLoading(true);
    try {
      const data = await adminFetch<SystemHealthResponse>("/api/v1/admin/system-health/");
      setFlags(data.feature_flags || []);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFlags();
  }, []);

  async function toggleFlag(flag: FeatureFlag) {
    setUpdatingKey(flag.key);
    setErrorMsg(null);
    try {
      await adminFetch("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "TOGGLE_FLAG",
          key: flag.key,
          is_enabled: !flag.is_enabled,
        }),
      });

      setFlags(flags.map((f) => f.key === flag.key ? { ...f, is_enabled: !f.is_enabled } : f));
      setSuccessMsg(`Flag ${flag.key} set to ${!flag.is_enabled ? "ENABLED" : "DISABLED"}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to update feature flag");
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleCreateFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) return;

    try {
      await adminFetch("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "TOGGLE_FLAG",
          key: newKey.trim().toUpperCase(),
          is_enabled: true,
          rollout_percentage: newRollout,
        }),
      });

      setIsModalOpen(false);
      setNewKey("");
      setNewDesc("");
      setSuccessMsg("Feature flag created and saved to database.");
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadFlags();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create flag");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §44 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Dynamic Feature Flags & Canary Rollouts
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Zero-downtime runtime toggles with targeted release parameters: Global, City-specific, or Percentage canary rollouts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Feature Flag
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

      {/* Flags List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
            Loading feature flags from PostgreSQL...
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {flags.map((f) => (
              <div key={f.id || f.key} className="p-5 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#0B192C]">{f.key}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      City: {f.target_city || "ALL"}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-mono">
                      {f.rollout_percentage}% Rollout
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{f.description}</p>
                </div>

                <button
                  type="button"
                  disabled={updatingKey === f.key}
                  onClick={() => toggleFlag(f)}
                  className="flex items-center gap-2 p-2 focus:outline-none disabled:opacity-50"
                >
                  {f.is_enabled ? (
                    <ToggleRight className="w-8 h-8 text-[#FF6500]" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateFlag} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">Create Feature Flag</h3>
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Flag Key (UPPER_SNAKE_CASE) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., ENABLE_AI_DISPATCH"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Purpose of this flag..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Rollout (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newRollout}
                    onChange={(e) => setNewRollout(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target City</label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
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
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg"
              >
                Save Flag
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
