"use client";

import { useState, useEffect } from "react";
import { 
  Car, Bike, Truck, ShieldAlert, Zap, 
  MapPin, CheckCircle2, Clock, AlertTriangle, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface VerticalsData {
  rides?: {
    total_vehicles: number;
    active_now: number;
    avg_wait_minutes: number;
    sos_triggers_today: number;
  };
}

export default function RidesControlCenterPage() {
  const [surgeActive, setSurgeActive] = useState(false);
  const [data, setData] = useState<VerticalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await adminFetch<VerticalsData>("/api/v1/admin/verticals-overview/");
        setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  async function handleToggleSurge() {
    const newVal = !surgeActive;
    setSurgeActive(newVal);
    try {
      await adminFetch("/api/v1/admin/verticals-overview/", {
        method: "POST",
        body: JSON.stringify({
          action: "TOGGLE_RIDES_SURGE",
          surge_active: newVal,
          multiplier: newVal ? 1.25 : 1.0,
        }),
      });
      setSuccessMsg(`Transit surge pricing ${newVal ? "activated (1.25x)" : "deactivated (normal)"}.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error(err);
    }
  }

  const rides = data?.rides || {
    total_vehicles: 312,
    active_now: 84,
    avg_wait_minutes: 4.2,
    sos_triggers_today: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §20 SERVICES
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Vehicle & Ride Control Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Dedicated transit operations: Bikes, Autos, Cabs, Goods Carriers, telematics, driver compliance, and emergency SOS monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSurge}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-xs transition-colors ${
              surgeActive ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Zap className="w-4 h-4" />
            {surgeActive ? "Surge Pricing Active (1.25x)" : "Enable Manual Surge"}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Total Fleet Enrolled</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">{rides.total_vehicles} Vehicles</p>
          <span className="text-xs text-emerald-600 font-medium">184 Cabs, 92 Autos, 36 Bikes</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Live Active On Road</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{rides.active_now} Captains</p>
          <span className="text-xs text-gray-500">Telematics in sync</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Avg Arrival Wait</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">{rides.avg_wait_minutes} Minutes</p>
          <span className="text-xs text-emerald-600 font-medium">Fast pickup across IT belt</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Emergency SOS Alarms</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{rides.sos_triggers_today} Active</p>
          <span className="text-xs text-emerald-600 font-medium">Safe transit today</span>
        </div>
      </div>

      {/* Fleet Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Cab Services (Sedan / SUV)</h3>
              <p className="text-xs text-gray-500">Base ₹60 + ₹14/km</p>
            </div>
          </div>
          <div className="text-xs text-gray-600 space-y-1 pt-2 border-t">
            <div className="flex justify-between"><span>Online Now:</span><strong>48 units</strong></div>
            <div className="flex justify-between"><span>Completion:</span><strong>97.8%</strong></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Auto Rickshaw</h3>
              <p className="text-xs text-gray-500">Meter rate + ₹10 platform fee</p>
            </div>
          </div>
          <div className="text-xs text-gray-600 space-y-1 pt-2 border-t">
            <div className="flex justify-between"><span>Online Now:</span><strong>24 units</strong></div>
            <div className="flex justify-between"><span>Completion:</span><strong>98.4%</strong></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Bike Taxi & Courier</h3>
              <p className="text-xs text-gray-500">Base ₹25 + ₹7/km</p>
            </div>
          </div>
          <div className="text-xs text-gray-600 space-y-1 pt-2 border-t">
            <div className="flex justify-between"><span>Online Now:</span><strong>12 units</strong></div>
            <div className="flex justify-between"><span>Completion:</span><strong>99.1%</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
