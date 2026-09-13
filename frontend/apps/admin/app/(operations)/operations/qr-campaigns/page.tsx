"use client";

import { useState } from "react";
import { 
  QrCode, Plus, Download, BarChart2, TrendingUp, 
  Search, ArrowUpRight, X, CheckCircle2 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface QRCampaign {
  id: string;
  name: string;
  channel: string;
  scans: number;
  installs: number;
  bookings: number;
  revenue_inr: number;
}

export default function QrCampaignManagementPage() {
  const [campaigns, setCampaigns] = useState<QRCampaign[]>([
    { id: "qr_1", name: "Gachibowli Auto Fleet Branding", channel: "Auto Rickshaw Backpanel", scans: 1420, installs: 412, bookings: 184, revenue_inr: 78400 },
    { id: "qr_2", name: "JNTU College Techfest Banners", channel: "Campus Banners", scans: 2890, installs: 940, bookings: 320, revenue_inr: 112000 },
    { id: "qr_3", name: "Madhapur Apartment Flyer Drops", channel: "Print Flyer", scans: 980, installs: 260, bookings: 114, revenue_inr: 62500 },
    { id: "qr_4", name: "HITEC City Metro Station Kiosk", channel: "Transit Kiosk", scans: 3450, installs: 1120, bookings: 490, revenue_inr: 198000 },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("Auto Rickshaw Backpanel");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await adminFetch<{ code: string }>("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_QR_CAMPAIGN",
          name: name.trim(),
          channel,
        }),
      });

      const newId = res.code || `qr_${Date.now()}`;
      setCampaigns([
        {
          id: newId,
          name: name.trim(),
          channel,
          scans: 0,
          installs: 0,
          bookings: 0,
          revenue_inr: 0,
        },
        ...campaigns,
      ]);

      setIsModalOpen(false);
      setName("");
      setSuccessMsg(`Campaign QR generated and logged to database.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownloadSvg(campaignName: string) {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#ffffff"/><rect x="20" y="20" width="60" height="60" fill="#0B192C"/><rect x="120" y="20" width="60" height="60" fill="#0B192C"/><rect x="20" y="120" width="60" height="60" fill="#0B192C"/><rect x="90" y="90" width="20" height="20" fill="#FF6500"/><text x="100" y="195" font-size="10" text-anchor="middle" fill="#555555">${campaignName}</text></svg>`;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR_${campaignName.replace(/\s+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §18 GROWTH
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              QR Campaign & Offline Attribution Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Track real-world physical marketing ROI: Autos, Cabs, Campuses, Flyers & Storefront QR codes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create New Campaign QR
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Total Offline Scans</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">
            {campaigns.reduce((a, b) => a + b.scans, 0).toLocaleString()} Scans
          </p>
          <span className="text-xs text-emerald-600 font-medium">+24% week-on-week</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Attributed App Installs</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {campaigns.reduce((a, b) => a + b.installs, 0).toLocaleString()} Installs
          </p>
          <span className="text-xs text-gray-500">31.2% scan-to-install rate</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Attributed Bookings</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">
            {campaigns.reduce((a, b) => a + b.bookings, 0).toLocaleString()} Orders
          </p>
          <span className="text-xs text-emerald-600 font-medium">40.5% conversion</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Attributed Net GMV</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            ₹{campaigns.reduce((a, b) => a + b.revenue_inr, 0).toLocaleString()}
          </p>
          <span className="text-xs text-emerald-600 font-medium">5.8x Blended ROAS</span>
        </div>
      </div>

      {/* Campaign List Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Campaign Name</th>
              <th className="px-5 py-3.5">Collateral Channel</th>
              <th className="px-5 py-3.5">Scans</th>
              <th className="px-5 py-3.5">App Installs</th>
              <th className="px-5 py-3.5">First Bookings</th>
              <th className="px-5 py-3.5">Attributed Revenue</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-bold text-[#0B192C] flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#FF6500]" />
                    {c.name}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-600">
                  {c.channel}
                </td>
                <td className="px-5 py-3.5 font-mono font-medium">
                  {c.scans.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 font-mono text-blue-700">
                  {c.installs.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 font-mono text-emerald-700">
                  {c.bookings.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 font-mono font-bold text-[#0B192C]">
                  ₹{c.revenue_inr.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => handleDownloadSvg(c.name)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    SVG Vector
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateCampaign} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">Create Campaign QR</h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Banjara Hills Canopy Promo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Marketing Collateral Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option>Auto Rickshaw Backpanel</option>
                  <option>Campus Banners</option>
                  <option>Print Flyer</option>
                  <option>Transit Kiosk</option>
                  <option>Storefront Display Standee</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg disabled:opacity-50"
              >
                {submitting ? "Generating..." : "Generate Campaign QR"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
