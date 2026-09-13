"use client";

import { useState, useEffect } from "react";
import { 
  Activity, Server, Database, Radio, CheckCircle2, 
  AlertTriangle, RefreshCw, Cpu, HardDrive, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface ComponentHealth {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  latency_ms: number;
  uptime?: string;
  connections_active?: number;
  memory_used_mb?: number;
  queue_depth?: number;
}

export default function SystemHealthMonitorPage() {
  const [components, setComponents] = useState<ComponentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallStatus, setOverallStatus] = useState("HEALTHY");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadHealth() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminFetch<{ components?: ComponentHealth[]; status?: string }>("/api/v1/admin/system-health/");
      setComponents(data.components || []);
      setOverallStatus(data.status || "HEALTHY");
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : "Failed to load subsystem health probes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §41 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Infrastructure & System Health Monitor
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time multi-service telemetry: PostgreSQL pools, Redis caches, Celery queues, and external gateway latencies.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            overallStatus === "HEALTHY" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>
            <span className={`w-2 h-2 rounded-full ${overallStatus === "HEALTHY" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            {overallStatus === "HEALTHY" ? "All Subsystems Operational" : "Subsystems Degraded"}
          </span>
          <button
            onClick={loadHealth}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={loadHealth} className="text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && components.length === 0 ? (
          <div className="col-span-3 py-12 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
            Pinging subsystem health probes via PostgreSQL connection pool...
          </div>
        ) : (
          components.map((c, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Probe #{idx + 1}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  c.status === "HEALTHY" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                }`}>
                  {c.status}
                </span>
              </div>
              <h3 className="font-bold text-[#0B192C] text-sm">{c.name}</h3>

              <div className="pt-2 border-t text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <strong className="font-mono text-[#0B192C]">{c.latency_ms} ms</strong>
                </div>
                {c.uptime && (
                  <div className="flex justify-between">
                    <span>Availability Uptime:</span>
                    <strong className="font-mono text-emerald-700">{c.uptime}</strong>
                  </div>
                )}
                {c.connections_active && (
                  <div className="flex justify-between">
                    <span>Active Connection Pool:</span>
                    <strong className="font-mono">{c.connections_active} connections</strong>
                  </div>
                )}
                {c.memory_used_mb && (
                  <div className="flex justify-between">
                    <span>Memory Usage:</span>
                    <strong className="font-mono">{c.memory_used_mb} MB</strong>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
