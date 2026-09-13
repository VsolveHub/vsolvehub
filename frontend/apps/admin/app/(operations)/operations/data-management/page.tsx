"use client";

import { useState } from "react";
import { 
  Database, Upload, Download, Trash2, CheckCircle2, 
  ShieldAlert, RefreshCw, Archive, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export default function DataManagementPage() {
  const [purgePhone, setPurgePhone] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePurge() {
    if (!purgePhone.trim()) {
      setErrorMessage("Please enter a customer phone number to purge.");
      return;
    }

    setPurging(true);
    setErrorMessage(null);
    try {
      await adminFetch("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "PURGE_PII",
          phone: purgePhone.trim(),
        }),
      });

      setPurgeSuccess(true);
      setPurgePhone("");
      setTimeout(() => setPurgeSuccess(false), 5000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to execute DPDP compliance request");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §46 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Data Lifecycle, Bulk Import & DPDP Compliance
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Bulk catalog CSV ingestion, stale telemetry archival, and DPDP India compliant customer data purge requests.
          </p>
        </div>
      </div>

      {purgeSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          DPDP Anonymization Request executed, audited in AdminAuditLog, and submitted to supervisor queue.
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMessage}
        </div>
      )}

      {/* Grid: Bulk Import vs DPDP Purge */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-[#0B192C] flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#FF6500]" />
            Bulk CSV Data Import
          </h3>
          <p className="text-xs text-gray-500">
            Bulk onboard partner profiles, service rate cards, or pincode boundaries via standardized CSV.
          </p>
          <div className="p-6 border-2 border-dashed border-gray-300 rounded-xl text-center space-y-2">
            <Upload className="w-8 h-8 text-gray-400 mx-auto" />
            <span className="text-xs font-semibold text-gray-700 block">Drag & drop CSV file or click to browse</span>
            <span className="text-[10px] text-gray-400 block">Supports up to 10,000 rows per batch</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-[#0B192C] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            DPDP / Right-to-be-Forgotten Data Purge
          </h3>
          <p className="text-xs text-gray-500">
            Permanently anonymize customer PII (phone number, address, payment tokens) while preserving financial ledger integrity.
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Customer Phone Number</label>
              <input
                type="text"
                placeholder="+919876543210"
                value={purgePhone}
                onChange={(e) => setPurgePhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs"
              />
            </div>
            <button
              type="button"
              onClick={handlePurge}
              disabled={purging}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              {purging ? "Purging PII..." : "Submit DPDP Purge Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
