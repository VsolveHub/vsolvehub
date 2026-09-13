"use client";

import { useState, useEffect } from "react";
import { 
  Smartphone, Monitor, AlertTriangle, CheckCircle2, 
  Save, RefreshCw, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface AppVersionItem {
  id: string;
  platform: string;
  client_name: string;
  current_version: string;
  min_supported_version: string;
  force_update: boolean;
  release_notes: string;
}

export default function AppVersionsManagementPage() {
  const [versions, setVersions] = useState<AppVersionItem[]>([
    { id: "v_cust_android", platform: "CUSTOMER_ANDROID", client_name: "Customer App (Android Play Store)", current_version: "2.4.1", min_supported_version: "2.2.0", force_update: false, release_notes: "Introduced UPI auto-pay, enhanced service search, and dark mode." },
    { id: "v_partner_android", platform: "PARTNER_ANDROID", client_name: "Partner App (Android Play Store)", current_version: "2.4.0", min_supported_version: "2.3.0", force_update: false, release_notes: "Added real-time duty radar and instant NEFT payout tracking." },
    { id: "v_cust_ios", platform: "CUSTOMER_IOS", client_name: "Customer App (Apple iOS App Store)", current_version: "2.4.1", min_supported_version: "2.2.0", force_update: false, release_notes: "Performance optimizations and Apple Pay integration." },
    { id: "v_web_admin", platform: "WEB_ADMIN", client_name: "Super App Control Center (Web)", current_version: "2.5.0", min_supported_version: "2.5.0", force_update: true, release_notes: "Deployed complete 58-section Super App Control Center." },
  ]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadPolicies() {
      try {
        const data = await adminFetch<{ app_versions?: Record<string, any> }>("/api/v1/admin/system-health/");
        if (data.app_versions) {
          setVersions(prev => prev.map(item => {
            const pKey = item.platform.toLowerCase();
            const pol = data.app_versions?.[pKey];
            if (pol) {
              return {
                ...item,
                current_version: pol.current || item.current_version,
                min_supported_version: pol.min_supported || item.min_supported_version,
                force_update: pol.force_update !== undefined ? pol.force_update : item.force_update,
              };
            }
            return item;
          }));
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadPolicies();
  }, []);

  function toggleForceUpdate(id: string) {
    setVersions(versions.map((v) => v.id === id ? { ...v, force_update: !v.force_update } : v));
  }

  function updateMinVersion(id: string, val: string) {
    setVersions(versions.map((v) => v.id === id ? { ...v, min_supported_version: val } : v));
  }

  async function handleSavePolicies() {
    setSaving(true);
    setErrorMsg(null);
    try {
      for (const v of versions) {
        await adminFetch("/api/v1/admin/system-health/", {
          method: "POST",
          body: JSON.stringify({
            action: "UPDATE_VERSION",
            platform: v.platform,
            current_version: v.current_version,
            min_supported_version: v.min_supported_version,
            force_update: v.force_update,
          }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to persist app versions");
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
              §43 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Mobile App Version & Force-Update Manager
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Control minimum supported builds and enforce mandatory upgrade gates across Android, iOS, and Web clients.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSavePolicies}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Version Policies"}
        </button>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          App version policies saved to PostgreSQL and distributed to client config endpoints.
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMsg}
        </div>
      )}

      {/* Versions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {versions.map((v) => (
          <div key={v.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#0B192C]">{v.client_name}</h3>
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                v{v.current_version}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-gray-600">
                <span>Minimum Supported Version:</span>
                <input
                  type="text"
                  value={v.min_supported_version}
                  onChange={(e) => updateMinVersion(v.id, e.target.value)}
                  className="font-mono text-xs px-2 py-1 border rounded w-24 text-right"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t text-gray-700">
                <span className="font-semibold">Enforce Force-Update Modal</span>
                <button
                  type="button"
                  onClick={() => toggleForceUpdate(v.id)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                    v.force_update ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {v.force_update ? "MANDATORY LOCK" : "OPTIONAL PROMPT"}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 pt-2 border-t">{v.release_notes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
