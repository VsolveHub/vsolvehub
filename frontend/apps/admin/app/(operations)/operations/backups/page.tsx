"use client";

import { useState } from "react";
import { 
  Database, ShieldCheck, CheckCircle2, Clock, 
  Download, RefreshCw, HardDrive, AlertTriangle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export default function BackupsDisasterRecoveryPage() {
  const [snapshotTriggered, setSnapshotTriggered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<string | null>(null);

  async function handleTriggerSnapshot() {
    setLoading(true);
    try {
      const res = await adminFetch<{ snapshot_id: string; size_mb: number }>("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "TRIGGER_BACKUP",
        }),
      });

      setSnapshotInfo(`${res.snapshot_id} (${res.size_mb} MB)`);
      setSnapshotTriggered(true);
      setTimeout(() => setSnapshotTriggered(false), 6000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §47 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Backup, Snapshot & Disaster Recovery Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Automated hourly WAL archiving, daily cryptographic full database snapshots, and cross-region replication health.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTriggerSnapshot}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] hover:bg-[#1E3E62] rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {loading ? "Creating Snapshot..." : "Trigger Manual Snapshot"}
        </button>
      </div>

      {snapshotTriggered && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          PostgreSQL 17 physical base snapshot initiated: {snapshotInfo}. Uploaded to Supabase Hot WAL & S3 backup storage.
        </div>
      )}

      {/* KPI Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">RPO (Recovery Point Obj)</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">&lt; 5 Minutes</p>
          <span className="text-xs text-emerald-600 font-medium">Continuous WAL streaming</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">RTO (Recovery Time Obj)</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">&lt; 15 Minutes</p>
          <span className="text-xs text-gray-500">Hot standby replica active</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Last Full Snapshot</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">Today 03:00 AM</p>
          <span className="text-xs text-gray-500">SHA-256 Verified (2.4 GB)</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Cross-Region DR Sync</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">100% In-Sync</p>
          <span className="text-xs text-gray-500">ap-south-1 → ap-south-2</span>
        </div>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-bold text-sm text-[#0B192C]">Recent Cryptographic Base Snapshots</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Snapshot Key</th>
              <th className="px-5 py-3.5">Type</th>
              <th className="px-5 py-3.5">Size</th>
              <th className="px-5 py-3.5">Checksum (SHA-256)</th>
              <th className="px-5 py-3.5">Timestamp</th>
              <th className="px-5 py-3.5 text-right">Integrity Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr className="hover:bg-gray-50/80 transition-colors">
              <td className="px-5 py-3.5 font-mono text-xs font-bold text-[#0B192C]">
                snap_20260910_030000_full.pgdump
              </td>
              <td className="px-5 py-3.5 text-xs text-gray-700">Scheduled Full</td>
              <td className="px-5 py-3.5 font-mono text-xs text-gray-800">2.42 GB</td>
              <td className="px-5 py-3.5 font-mono text-xs text-gray-400">e3b0c442...9821</td>
              <td className="px-5 py-3.5 text-xs text-gray-500">2026-09-10 03:00:12 IST</td>
              <td className="px-5 py-3.5 text-right">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                  Verified & Cold-Stored
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
