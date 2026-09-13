"use client";

import { useState } from "react";
import { 
  Image, Plus, Edit3, Trash2, Eye, 
  CheckCircle2, AlertCircle, FileText, X 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface BannerItem {
  id: string;
  title: string;
  placement: "HOME_HERO" | "CATEGORY_HEADER" | "EMERGENCY_TICKER" | "POPUP_MODAL";
  target_url: string;
  is_active: boolean;
}

export default function CmsManagementPage() {
  const [banners, setBanners] = useState<BannerItem[]>([
    { id: "b1", title: "Summer AC Service & Gas Charging 20% Off", placement: "HOME_HERO", target_url: "/services/ac-repair", is_active: true },
    { id: "b2", title: "Monsoon Waterproofing & Terrace Sealing Special", placement: "HOME_HERO", target_url: "/services/waterproofing", is_active: true },
    { id: "b3", title: "Heavy Rain Alert: Minor delays in auto & bike taxi services", placement: "EMERGENCY_TICKER", target_url: "#", is_active: true },
    { id: "b4", title: "Student Perks: Verify ID to unlock ₹200 V Coins", placement: "POPUP_MODAL", target_url: "/student-verification", is_active: true },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState<BannerItem["placement"]>("HOME_HERO");
  const [targetUrl, setTargetUrl] = useState("/services");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleCreateBanner(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await adminFetch<{ banner_id: string }>("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_BANNER",
          title: title.trim(),
          target_screen: placement,
          image_url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952",
          is_active: true,
        }),
      });

      setBanners([
        {
          id: res.banner_id || `b_${Date.now()}`,
          title: title.trim(),
          placement: placement,
          target_url: targetUrl.trim(),
          is_active: true,
        },
        ...banners,
      ]);

      setIsModalOpen(false);
      setTitle("");
      setSuccessMsg("Digital asset created and persisted to CMS database.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleToggleStatus(id: string) {
    setBanners(banners.map(b => b.id === id ? { ...b, is_active: !b.is_active } : b));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §31 SYSTEM / CMS
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Banner & Content Management (CMS)
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Direct administrative control over client digital assets: Homepage hero banners, emergency tickers, popups, and legal policies.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Digital Asset
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.map((b) => (
          <div key={b.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 font-mono">
                {b.placement}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                b.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
              }`}>
                {b.is_active ? "Live" : "Inactive"}
              </span>
            </div>
            <h3 className="font-bold text-[#0B192C] text-sm">{b.title}</h3>
            <p className="text-xs text-gray-500 font-mono">Target: {b.target_url}</p>

            <div className="pt-3 border-t flex justify-end gap-2 text-xs">
              <button
                onClick={() => handleToggleStatus(b.id)}
                className={`px-3 py-1 rounded-md font-semibold ${
                  b.is_active ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {b.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateBanner} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">Add Digital CMS Asset</h3>
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Asset Title / Headline *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Diwali Home Deep Cleaning Special"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Placement Slot</label>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="HOME_HERO">Homepage Hero Carousel</option>
                  <option value="CATEGORY_HEADER">Category Header Banner</option>
                  <option value="EMERGENCY_TICKER">Emergency Live Ops Ticker</option>
                  <option value="POPUP_MODAL">App Launch Dialog Popup</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Target Deep Link / Route</label>
                <input
                  type="text"
                  placeholder="/services/cleaning"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-xs"
                />
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
                {submitting ? "Publishing..." : "Publish Banner"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
