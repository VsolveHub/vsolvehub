"use client";

import { useState, useEffect } from "react";
import { 
  Sliders, Award, Star, CheckCircle, AlertCircle, 
  TrendingUp, RefreshCw, Save 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export default function PartnerRankingPage() {
  const [ratingWeight, setRatingWeight] = useState(35);
  const [completionWeight, setCompletionWeight] = useState(25);
  const [speedWeight, setSpeedWeight] = useState(15);
  const [distanceWeight, setDistanceWeight] = useState(15);
  const [cancellationPenalty, setCancellationPenalty] = useState(10);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = ratingWeight + completionWeight + speedWeight + distanceWeight + cancellationPenalty;

  useEffect(() => {
    async function loadRankingConfig() {
      try {
        const data = await adminFetch<{ weights?: Record<string, number> }>("/api/v1/admin/partner-ranking/");
        if (data.weights) {
          if (data.weights.customer_rating !== undefined) setRatingWeight(data.weights.customer_rating);
          if (data.weights.completion_rate !== undefined) setCompletionWeight(data.weights.completion_rate);
          if (data.weights.response_speed !== undefined) setSpeedWeight(data.weights.response_speed);
          if (data.weights.proximity_distance !== undefined) setDistanceWeight(data.weights.proximity_distance);
          if (data.weights.cancellation_penalty !== undefined) setCancellationPenalty(data.weights.cancellation_penalty);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRankingConfig();
  }, []);

  async function handleSaveWeights() {
    setSaving(true);
    setError(null);
    try {
      await adminFetch("/api/v1/admin/partner-ranking/", {
        method: "POST",
        body: JSON.stringify({
          weights: {
            customer_rating: ratingWeight,
            completion_rate: completionWeight,
            response_speed: speedWeight,
            proximity_distance: distanceWeight,
            cancellation_penalty: cancellationPenalty,
          }
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to persist ranking weights");
    } finally {
      setSaving(false);
    }
  }

  // Simulator values
  const simRating = 4.8;
  const simCompletion = 98;
  const simSpeedMinutes = 8;
  const simDistanceKm = 3.2;
  const simCancellationRate = 1.2;

  // Composite score calculation
  const compositeScore = Math.round(
    (simRating / 5.0) * ratingWeight +
    (simCompletion / 100) * completionWeight +
    Math.max(0, 1 - simSpeedMinutes / 30) * speedWeight +
    Math.max(0, 1 - simDistanceKm / 15) * distanceWeight -
    (simCancellationRate / 100) * cancellationPenalty * 5
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §33 MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Multi-Factor Partner Ranking Engine
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure mathematical weights for automated vendor ranking, job dispatch priority, and tier badge assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveWeights}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving to Database..." : "Save Weight Calibration"}
          </button>
        </div>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          Ranking weights saved to PostgreSQL and logged to immutable audit trail.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {error}
        </div>
      )}

      {/* Two Column Layout: Controls vs Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Weight Sliders */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#FF6500]" />
              Algorithm Weight Matrix (Must equal 100%)
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
              totalWeight === 100 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}>
              Total: {totalWeight}%
            </span>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Customer Rating Weight</span>
                <span className="font-mono text-[#0B192C]">{ratingWeight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                value={ratingWeight}
                onChange={(e) => setRatingWeight(Number(e.target.value))}
                className="w-full accent-[#FF6500]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Job Completion Rate Weight</span>
                <span className="font-mono text-[#0B192C]">{completionWeight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={completionWeight}
                onChange={(e) => setCompletionWeight(Number(e.target.value))}
                className="w-full accent-[#FF6500]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Response Speed (Minutes to Accept)</span>
                <span className="font-mono text-[#0B192C]">{speedWeight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={speedWeight}
                onChange={(e) => setSpeedWeight(Number(e.target.value))}
                className="w-full accent-[#FF6500]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Proximity Distance (Geodesic KM)</span>
                <span className="font-mono text-[#0B192C]">{distanceWeight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                value={distanceWeight}
                onChange={(e) => setDistanceWeight(Number(e.target.value))}
                className="w-full accent-[#FF6500]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Cancellation Penalty Deduction</span>
                <span className="font-mono text-red-600">-{cancellationPenalty}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={cancellationPenalty}
                onChange={(e) => setCancellationPenalty(Number(e.target.value))}
                className="w-full accent-red-600"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Simulated Ranking Sandbox */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Live Simulation: Partner Match Score
            </h2>

            <div className="p-4 bg-slate-900 rounded-xl text-white text-center">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                Composite Priority Score
              </span>
              <div className="text-4xl font-extrabold font-mono text-[#FF6500] mt-1">
                {compositeScore} / 100
              </div>
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300">
                Gold Tier — Priority #1 Dispatch
              </span>
            </div>

            <div className="text-xs space-y-2 border-t pt-3 text-gray-600">
              <div className="flex justify-between">
                <span>Sample Rating:</span>
                <strong className="text-gray-900">{simRating} ★ (140 reviews)</strong>
              </div>
              <div className="flex justify-between">
                <span>Completion Rate:</span>
                <strong className="text-emerald-700">{simCompletion}%</strong>
              </div>
              <div className="flex justify-between">
                <span>Acceptance Speed:</span>
                <strong className="text-gray-900">{simSpeedMinutes} min</strong>
              </div>
              <div className="flex justify-between">
                <span>Distance to Job:</span>
                <strong className="text-gray-900">{simDistanceKm} km</strong>
              </div>
              <div className="flex justify-between">
                <span>Cancellation Rate:</span>
                <strong className="text-gray-900">{simCancellationRate}%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
