"use client";

import { useState, useEffect } from "react";
import { 
  ShieldAlert, AlertTriangle, CheckCircle, XCircle, 
  MapPin, Smartphone, RefreshCw, UserX, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface RiskIncident {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  target: string;
  details: string;
  detected_at: string;
  status: "OPEN" | "RESOLVED" | "BLOCKED";
}

interface GrowthResponse {
  fraud_anomalies?: RiskIncident[];
}

export default function FraudRiskCenterPage() {
  const [incidents, setIncidents] = useState<RiskIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadAnomalies() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminFetch<GrowthResponse>("/api/v1/admin/growth/");
      setIncidents(data.fraud_anomalies || []);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to load risk anomalies");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnomalies();
  }, []);

  async function handleAction(id: string, action: "RESOLVE" | "BLOCK") {
    setActionLoading(id);
    setErrorMessage(null);
    try {
      await adminFetch("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "RISK_ACTION",
          risk_id: id,
          risk_action: action,
        }),
      });

      setIncidents(prev => prev.map(inc => 
        inc.id === id ? { ...inc, status: action === "BLOCK" ? "BLOCKED" : "RESOLVED" } : inc
      ));
      setSuccessMessage(`Anomaly ${id} marked as ${action === "BLOCK" ? "BLOCKED (Account Suspended)" : "RESOLVED"}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to execute risk action");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700">
              §34 FRAUD & RISK
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Fraud, Risk & Real-Time Anomaly Engine
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Proactive security alerts: GPS spoofing, mock location drivers, velocity abuse, device fingerprint collision, and money mule cash-outs.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={loadAnomalies}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Signals
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMessage}
        </div>
      )}

      {/* Incidents Stream */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
            Loading real-time risk detections...
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            No active fraud anomalies detected across network.
          </div>
        ) : (
          incidents.map((inc) => (
            <div 
              key={inc.id}
              className={`p-5 rounded-xl border bg-white shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                inc.severity === "CRITICAL" ? "border-red-300 ring-1 ring-red-100" : "border-gray-200"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    inc.severity === "CRITICAL" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800"
                  }`}>
                    {inc.severity}
                  </span>
                  <span className="font-mono text-xs font-bold text-gray-500">{inc.type}</span>
                  <span className="text-xs text-gray-400">• {new Date(inc.detected_at).toLocaleTimeString()}</span>
                </div>
                <h3 className="font-bold text-[#0B192C] text-sm">{inc.target}</h3>
                <p className="text-xs text-gray-600">{inc.details}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {inc.status === "OPEN" ? (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading === inc.id}
                      onClick={() => handleAction(inc.id, "RESOLVE")}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
                    >
                      Dismiss False Positive
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === inc.id}
                      onClick={() => handleAction(inc.id, "BLOCK")}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-xs disabled:opacity-50"
                    >
                      {actionLoading === inc.id ? "Blocking..." : "Freeze Account Immediately"}
                    </button>
                  </>
                ) : (
                  <span className={`px-3 py-1 text-xs font-bold rounded-lg ${
                    inc.status === "BLOCKED" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {inc.status}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
