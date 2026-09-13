"use client";

import { useState, useEffect } from "react";
import { 
  LayoutDashboard, CheckSquare, Square, Save, RotateCcw, 
  CheckCircle2, Sliders, Eye 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface WidgetItem {
  id: string;
  name: string;
  category: string;
  default_enabled: boolean;
}

const DEFAULT_WIDGETS: Record<string, boolean> = {
  w_rev: true,
  w_partners: true,
  w_approvals: true,
  w_kyc: true,
  w_bids: true,
  w_health: true,
  w_fraud: false,
  w_campaigns: false,
};

export default function DashboardCustomizerPage() {
  const [widgets] = useState<WidgetItem[]>([
    { id: "w_rev", name: "Real-Time GMV & Revenue Counter", category: "Money", default_enabled: true },
    { id: "w_partners", name: "Live Online Partner Duty Map", category: "Operations", default_enabled: true },
    { id: "w_approvals", name: "Pending Four-Eyes Dual Approvals", category: "Governance", default_enabled: true },
    { id: "w_kyc", name: "KYC Inspection Queue SLA Counter", category: "Users", default_enabled: true },
    { id: "w_bids", name: "Open RFQ Construction Bids", category: "Marketplace", default_enabled: true },
    { id: "w_health", name: "Database & Microservice Health Status", category: "System", default_enabled: true },
    { id: "w_fraud", name: "Real-time Velocity Abuse Anomaly Stream", category: "Risk", default_enabled: false },
    { id: "w_campaigns", name: "Active QR Code Campaign Scans", category: "Growth", default_enabled: false },
  ]);

  const [activeWidgets, setActiveWidgets] = useState<Record<string, boolean>>(DEFAULT_WIDGETS);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vsolvehub_admin_dashboard_widgets");
      if (stored) {
        setActiveWidgets(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not read localStorage", e);
    }
  }, []);

  function toggleWidget(id: string) {
    setActiveWidgets((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function savePreferences() {
    setIsSaving(true);
    try {
      localStorage.setItem("vsolvehub_admin_dashboard_widgets", JSON.stringify(activeWidgets));
      await adminFetch("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "SAVE_DASHBOARD_LAYOUT",
          layout: activeWidgets,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save layout preferences", e);
    } finally {
      setIsSaving(false);
    }
  }

  function resetDefaults() {
    setActiveWidgets(DEFAULT_WIDGETS);
    localStorage.setItem("vsolvehub_admin_dashboard_widgets", JSON.stringify(DEFAULT_WIDGETS));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §2 COMMAND CENTER
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Fully Customizable Dashboard Layout
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Personalize your operational control center. Toggle and organize widget cards according to your administrative role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={savePreferences}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Layout Preference"}
          </button>
        </div>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Dashboard layout preferences synchronized and saved to your admin persona profile.
        </div>
      )}

      {/* Widget Selector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {widgets.map((w) => {
          const isEnabled = activeWidgets[w.id];
          return (
            <div
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                isEnabled
                  ? "bg-white border-[#FF6500] shadow-xs ring-1 ring-[#FF6500]/20"
                  : "bg-gray-50 border-gray-200 opacity-60"
              }`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {w.category}
                </span>
                <h4 className="font-bold text-sm text-[#0B192C] mt-0.5">{w.name}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {isEnabled ? "Visible on main overview dashboard" : "Hidden from workspace"}
                </p>
              </div>
              <div>
                {isEnabled ? (
                  <CheckSquare className="w-5 h-5 text-[#FF6500]" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
