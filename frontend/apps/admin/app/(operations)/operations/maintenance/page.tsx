"use client";

import { useState } from "react";
import { 
  AlertOctagon, ShieldAlert, ToggleLeft, ToggleRight, 
  CheckCircle2, Clock, Wrench, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export default function MaintenanceModePage() {
  const [platformLocked, setPlatformLocked] = useState(false);
  const [customerAppLocked, setCustomerAppLocked] = useState(false);
  const [partnerAppLocked, setPartnerAppLocked] = useState(false);
  const [ridesPaused, setRidesPaused] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleToggle(component: string, currentVal: boolean, setter: (val: boolean) => void) {
    const newVal = !currentVal;
    setter(newVal);
    try {
      await adminFetch("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "MAINTENANCE_TOGGLE",
          component,
          enabled: newVal,
        }),
      });
      setSuccessMsg(`Maintenance flag for ${component} set to ${newVal ? "ENABLED (LOCKED)" : "DISABLED (NORMAL)"}.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error(err);
      setter(currentVal); // revert
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">
              §45 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Granular Maintenance Mode & Emergency Isolation
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Surgically freeze individual client apps, single business verticals, or trigger whole-platform maintenance screens during critical upgrades.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Control Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase text-red-600">Platform Lockdown</span>
            <h3 className="font-bold text-[#0B192C] text-sm mt-0.5">Whole System Maintenance Mode</h3>
            <p className="text-xs text-gray-500 mt-1">Directs all incoming mobile traffic to 503 maintenance splash.</p>
          </div>
          <button 
            type="button" 
            onClick={() => handleToggle("PLATFORM_LOCKDOWN", platformLocked, setPlatformLocked)}
            className="p-1 focus:outline-none"
          >
            {platformLocked ? <ToggleRight className="w-8 h-8 text-red-600" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase text-amber-600">Vertical Freeze</span>
            <h3 className="font-bold text-[#0B192C] text-sm mt-0.5">Pause Transit & Rides Vertical</h3>
            <p className="text-xs text-gray-500 mt-1">Used during monsoons or city traffic advisories.</p>
          </div>
          <button 
            type="button" 
            onClick={() => handleToggle("VERTICAL_RIDES", ridesPaused, setRidesPaused)}
            className="p-1 focus:outline-none"
          >
            {ridesPaused ? <ToggleRight className="w-8 h-8 text-amber-600" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase text-blue-600">Client Isolation</span>
            <h3 className="font-bold text-[#0B192C] text-sm mt-0.5">Customer App Read-Only</h3>
            <p className="text-xs text-gray-500 mt-1">Disable checkout while allowing service browsing.</p>
          </div>
          <button 
            type="button" 
            onClick={() => handleToggle("CUSTOMER_APP_READONLY", customerAppLocked, setCustomerAppLocked)}
            className="p-1 focus:outline-none"
          >
            {customerAppLocked ? <ToggleRight className="w-8 h-8 text-blue-600" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase text-purple-600">Client Isolation</span>
            <h3 className="font-bold text-[#0B192C] text-sm mt-0.5">Partner App Payout Freeze</h3>
            <p className="text-xs text-gray-500 mt-1">Temporary hold during financial ledger migrations.</p>
          </div>
          <button 
            type="button" 
            onClick={() => handleToggle("PARTNER_PAYOUT_FREEZE", partnerAppLocked, setPartnerAppLocked)}
            className="p-1 focus:outline-none"
          >
            {partnerAppLocked ? <ToggleRight className="w-8 h-8 text-purple-600" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
        </div>
      </div>
    </div>
  );
}
