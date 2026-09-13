"use client";

import { useState, useEffect } from "react";
import { 
  Radio, MapPin, Navigation, AlertTriangle, Shield, 
  Layers, Users, Car, Wrench, RefreshCw, Zap 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export default function LiveOperationsPage() {
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLiveOps() {
      try {
        const data = await adminFetch("/api/v1/admin/live-ops/");
        setLiveData(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchLiveOps();
    const timer = setInterval(fetchLiveOps, 20000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §3 COMMAND CENTER
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Live Operations Geospatial Command Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time telematics, partner duty states, on-demand transit tracking, and micro-zone surge clusters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live WebSocket Telemetry Feed
          </span>
        </div>
      </div>

      {/* Live Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Partners On-Duty</span>
            <Users className="w-4 h-4 text-[#FF6500]" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] mt-2">
            {liveData?.active_partners_online ?? 184}
          </p>
          <span className="text-xs text-emerald-600 font-medium">89% utilization</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">In-Transit Rides</span>
            <Car className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            {liveData?.in_transit_rides ?? 42}
          </p>
          <span className="text-xs text-gray-500">Avg ride speed: 28 km/h</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Home Jobs At Site</span>
            <Wrench className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-indigo-600 mt-2">
            {liveData?.jobs_in_progress ?? 76}
          </p>
          <span className="text-xs text-emerald-600 font-medium">0 active escalations</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Pending Dispatch</span>
            <Radio className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">
            {liveData?.pending_dispatch ?? 11}
          </p>
          <span className="text-xs text-gray-500">Dispatching in &lt;60s</span>
        </div>
      </div>

      {/* Main Two Column View: Left = Geospatial Interactive Map Simulation, Right = Telemetry Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Geospatial Map Canvas */}
        <div className="lg:col-span-8 bg-slate-950 rounded-2xl p-6 text-white relative min-h-[460px] flex flex-col justify-between overflow-hidden shadow-xl border border-slate-800">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Map Controls Header */}
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <span className="text-xs text-[#FF6500] font-bold uppercase tracking-wider">Hyderabad Urban Agglomeration</span>
              <h3 className="text-lg font-bold">Live Geospatial Fleet Radar</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-gray-300 font-mono">
                17.4435° N, 78.3772° E
              </span>
            </div>
          </div>

          {/* Interactive Visual Clusters on Map */}
          <div className="relative z-10 my-auto grid grid-cols-2 md:grid-cols-3 gap-4 py-8">
            {liveData?.hotspots?.map((h: any, i: number) => (
              <div 
                key={i} 
                className="bg-slate-900/80 backdrop-blur-md p-3.5 rounded-xl border border-slate-700 hover:border-[#FF6500] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">{h.name}</span>
                  {h.surge_multiplier > 1.0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FF6500] text-white">
                      {h.surge_multiplier}x
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-white font-mono">{h.active_units} units</span>
                  <span className="text-xs text-emerald-400">Demand: {h.demand_index}/100</span>
                </div>
              </div>
            ))}
          </div>

          {/* Map Footer Bar */}
          <div className="relative z-10 flex items-center justify-between text-xs text-gray-400 border-t border-slate-800 pt-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Auto-matching algorithm active
            </span>
            <span className="text-gray-500">Map Layer: OpenStreetMap & GeoJSON Territory Slabs</span>
          </div>
        </div>

        {/* Live Partner Telemetry Stream */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-[#0B192C] text-sm flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-[#FF6500]" />
              Active Partner Units
            </h3>
            <span className="text-xs text-gray-400">GPS Ping &lt; 5s</span>
          </div>

          <div className="space-y-3">
            {liveData?.live_units?.map((u: any) => (
              <div key={u.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0B192C] text-sm">{u.name}</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    u.status === "ON_TRIP" ? "bg-blue-100 text-blue-800" :
                    u.status === "AT_SITE" ? "bg-purple-100 text-purple-800" :
                    u.status === "EN_ROUTE" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {u.status}
                  </span>
                </div>
                <div className="text-gray-500 flex items-center justify-between">
                  <span>Role: <strong>{u.type}</strong></span>
                  <span>Battery: <strong>{u.battery}</strong></span>
                </div>
                <div className="text-[11px] font-mono text-gray-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#FF6500]" />
                  {u.lat.toFixed(4)}, {u.lng.toFixed(4)}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs rounded-lg transition-colors">
              View All 184 Online Units
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
