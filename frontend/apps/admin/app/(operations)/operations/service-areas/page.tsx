"use client";

import { useState, useEffect } from "react";
import { 
  MapPin, Plus, CheckCircle2, XCircle, Search, 
  Layers, Sliders, Globe, Shield, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface CityZone {
  id: string;
  country: string;
  state: string;
  city: string;
  zone: string;
  area: string;
  pincode: string;
  service_radius_km: number;
  is_active: boolean;
  is_accepting_partners: boolean;
  pricing_multiplier: number;
}

export default function ServiceAreasPage() {
  const [zones, setZones] = useState<CityZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [selectedZone, setSelectedZone] = useState<CityZone | null>(null);
  const [editMultiplier, setEditMultiplier] = useState<string>("1.0");
  const [editRadius, setEditRadius] = useState<string>("10");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newZoneData, setNewZoneData] = useState({
    city_name: "Hyderabad",
    zone_name: "Zone 1 - West IT Corridor",
    area_name: "",
    pincode: "",
    service_radius_km: 10,
    pricing_multiplier: 1.0,
  });

  async function fetchZones() {
    setLoading(true);
    try {
      const res = await adminFetch("/api/v1/admin/zones/");
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
      }
    } catch (err) {
      console.error("Failed to fetch zones", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchZones();
  }, []);

  const filtered = zones.filter((z) => {
    const matchesSearch = 
      z.area.toLowerCase().includes(search.toLowerCase()) ||
      z.zone.toLowerCase().includes(search.toLowerCase()) ||
      z.pincode.includes(search);
    const matchesCity = cityFilter === "ALL" || z.city === cityFilter;
    return matchesSearch && matchesCity;
  });

  const handleEditOpen = (z: CityZone) => {
    setSelectedZone(z);
    setEditMultiplier(z.pricing_multiplier.toString());
    setEditRadius(z.service_radius_km.toString());
  };

  const handleSaveSettings = async () => {
    if (!selectedZone) return;
    setIsSaving(true);
    try {
      const res = await adminFetch("/api/v1/admin/zones/", {
        method: "POST",
        body: JSON.stringify({
          action: "UPDATE",
          zone_id: selectedZone.id,
          pricing_multiplier: parseFloat(editMultiplier) || 1.0,
          service_radius_km: parseInt(editRadius, 10) || 10,
        }),
      });
      if (res.ok) {
        setSelectedZone(null);
        await fetchZones();
      } else {
        alert("Failed to update territory settings");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving territory settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneData.area_name || !newZoneData.pincode) {
      alert("Please specify area name and pincode");
      return;
    }
    setIsSaving(true);
    try {
      const res = await adminFetch("/api/v1/admin/zones/", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE",
          ...newZoneData,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewZoneData({
          city_name: "Hyderabad",
          zone_name: "Zone 1 - West IT Corridor",
          area_name: "",
          pincode: "",
          service_radius_km: 10,
          pricing_multiplier: 1.0,
        });
        await fetchZones();
      } else {
        alert("Failed to create service zone");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating service zone");
    } finally {
      setIsSaving(false);
    }
  };

  const cities = Array.from(new Set(zones.map((z) => z.city)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §19 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              City & Geospatial Service Area Management
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure 6-tier operational territory hierarchy: Country → State → City → Zone → Area → Pincode.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Service Zone
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Active Metros</span>
            <Globe className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] mt-2">{cities.length || 2} Cities</p>
          <span className="text-xs text-emerald-600 font-medium">Pan-India Network</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Micro-Zones</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] mt-2">{zones.length} Zones</p>
          <span className="text-xs text-gray-500">Live operational clusters</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Partner Onboarding</span>
            <Shield className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] mt-2">100% Open</p>
          <span className="text-xs text-emerald-600 font-medium">All zones accepting vendors</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Pricing Index Avg</span>
            <Sliders className="w-4 h-4 text-[#FF6500]" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] mt-2">
            {zones.length > 0 
              ? (zones.reduce((sum, z) => sum + z.pricing_multiplier, 0) / zones.length).toFixed(2)
              : "1.00"}x
          </p>
          <span className="text-xs text-gray-500">Zone-based price multiplier</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by area, zone or pincode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6500] focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
          >
            <option value="ALL">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Zones Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Zone & Area</th>
                <th className="px-5 py-3.5">City & State</th>
                <th className="px-5 py-3.5">Pincode</th>
                <th className="px-5 py-3.5">Radius</th>
                <th className="px-5 py-3.5">Pricing Multiplier</th>
                <th className="px-5 py-3.5">Booking Status</th>
                <th className="px-5 py-3.5">Partner Intake</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                    Loading geospatial territory data...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-500">
                    No service zones found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((z) => (
                  <tr key={z.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0B192C]">{z.area}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#FF6500]" />
                        {z.zone}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-gray-800">{z.city}</span>
                      <span className="text-xs text-gray-500 block">{z.state}, {z.country}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-700 font-semibold">
                      {z.pincode}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {z.service_radius_km} km
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 font-mono">
                        {z.pricing_multiplier.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {z.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Live Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                          <XCircle className="w-3 h-3" /> Paused
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {z.is_accepting_partners ? (
                        <span className="text-xs font-semibold text-emerald-700">Accepting</span>
                      ) : (
                        <span className="text-xs font-semibold text-red-600">Waitlist</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleEditOpen(z)}
                        className="px-3 py-1 text-xs font-medium text-[#1E3E62] hover:text-[#0B192C] bg-gray-100 hover:bg-gray-200 rounded-md transition-colors cursor-pointer"
                      >
                        Edit Slabs
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zone Detail Modal */}
      {selectedZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-[#0B192C]">
                Zone Configuration: {selectedZone.area}
              </h3>
              <button 
                onClick={() => setSelectedZone(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <p><strong>Pincode:</strong> {selectedZone.pincode}</p>
              <p><strong>City:</strong> {selectedZone.city}, {selectedZone.state}</p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Zone Pricing Multiplier (e.g. 1.15 = 15% surcharge)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={editMultiplier}
                  onChange={(e) => setEditMultiplier(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Service Radius (KM)
                </label>
                <input
                  type="number"
                  value={editRadius}
                  onChange={(e) => setEditRadius(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setSelectedZone(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveSettings}
                className="px-4 py-2 text-sm rounded-lg bg-[#FF6500] text-white font-semibold hover:bg-[#E35B00] disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? "Saving..." : "Save Territory Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Service Zone Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form onSubmit={handleCreateZone} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-[#0B192C]">
                Add New Operational Service Zone
              </h3>
              <button 
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={newZoneData.city_name}
                    onChange={(e) => setNewZoneData({ ...newZoneData, city_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Zone Cluster</label>
                  <input
                    type="text"
                    required
                    value={newZoneData.zone_name}
                    onChange={(e) => setNewZoneData({ ...newZoneData, zone_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Area / Locality Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kondapur / Botanical Garden"
                  value={newZoneData.area_name}
                  onChange={(e) => setNewZoneData({ ...newZoneData, area_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode</label>
                  <input
                    type="text"
                    required
                    placeholder="500084"
                    value={newZoneData.pincode}
                    onChange={(e) => setNewZoneData({ ...newZoneData, pincode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Radius (km)</label>
                  <input
                    type="number"
                    value={newZoneData.service_radius_km}
                    onChange={(e) => setNewZoneData({ ...newZoneData, service_radius_km: parseInt(e.target.value, 10) || 10 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Multiplier</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newZoneData.pricing_multiplier}
                    onChange={(e) => setNewZoneData({ ...newZoneData, pricing_multiplier: parseFloat(e.target.value) || 1.0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded-lg bg-[#FF6500] text-white font-semibold hover:bg-[#E35B00] disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? "Creating..." : "Create Zone"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
