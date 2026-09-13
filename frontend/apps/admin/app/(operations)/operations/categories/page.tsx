"use client";

import { useState, useEffect } from "react";
import { 
  FolderTree, Plus, Layers, Search, CheckCircle2, 
  ChevronRight, Edit3, Image, RefreshCw, Sliders, X, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_key: string;
  image_url: string;
  display_order: number;
  is_active: boolean;
  subcategories_count: number;
  services_count: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<CategoryRecord | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadCategories() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminFetch<{ categories: CategoryRecord[] }>("/api/v1/admin/categories/");
      setCategories(data.categories || []);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await adminFetch("/api/v1/admin/categories/", {
        method: "POST",
        body: JSON.stringify({
          name: newCatName.trim(),
          slug: newCatSlug.trim() || undefined,
          description: newCatDesc.trim(),
        }),
      });

      setIsAddModalOpen(false);
      setNewCatName("");
      setNewCatSlug("");
      setNewCatDesc("");
      setSuccessMsg(`Category created and persisted to database.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadCategories();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCat) return;

    setSubmitting(true);
    try {
      await adminFetch("/api/v1/admin/categories/", {
        method: "POST",
        body: JSON.stringify({
          name: selectedCat.name,
          slug: selectedCat.slug,
          description: selectedCat.description,
        }),
      });
      setSelectedCat(null);
      setSuccessMsg("Category details updated.");
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadCategories();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §7 MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              5-Tier Category & Taxonomy Management
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure platform service catalog hierarchy: Category → Subcategory → Service Item → Intake Question Forms → Service Variants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Master Category
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={loadCategories} className="text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Master Categories</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">{categories.length} Verticals</p>
          <span className="text-xs text-emerald-600 font-medium">All verticals active</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Subcategories</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {categories.reduce((acc, c) => acc + (c.subcategories_count || 0), 0)} Sub-tiers
          </p>
          <span className="text-xs text-gray-500">Browse tile layout</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Marketplace Services</span>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {categories.reduce((acc, c) => acc + (c.services_count || 0), 0)} Active Services
          </p>
          <span className="text-xs text-emerald-600 font-medium">100% Bookable</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search categories by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
          />
        </div>
      </div>

      {/* Taxonomy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-3 py-12 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
            Loading catalog taxonomy from database...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-3 py-12 text-center text-gray-500">
            No categories match your filter. Click &quot;Add Master Category&quot; to create one.
          </div>
        ) : (
          filtered.map((cat) => (
            <div 
              key={cat.id} 
              className="bg-white rounded-xl border border-gray-200 shadow-xs hover:border-[#FF6500]/50 transition-all p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#0B192C] text-white flex items-center justify-center font-bold text-sm">
                      {cat.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-[#0B192C] text-base leading-tight">
                        {cat.name}
                      </h3>
                      <span className="text-xs font-mono text-gray-400">/{cat.slug}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700">
                    Live
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-3 line-clamp-2">
                  {cat.description || "No description provided."}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
                <div className="space-x-3 text-gray-500">
                  <span><strong>{cat.subcategories_count || 0}</strong> Subcategories</span>
                  <span>•</span>
                  <span><strong>{cat.services_count || 0}</strong> Services</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className="inline-flex items-center gap-1 font-semibold text-[#FF6500] hover:text-[#E35B00]"
                >
                  Manage Tree <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Master Category Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateCategory} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">Create Master Category</h3>
              <button 
                type="button" 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Solar & Renewable Energy"
                  value={newCatName}
                  onChange={(e) => {
                    setNewCatName(e.target.value);
                    if (!newCatSlug) {
                      setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#FF6500]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Slug (URL identifier)</label>
                <input
                  type="text"
                  placeholder="e.g., solar-renewable"
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-xs focus:ring-2 focus:ring-[#FF6500]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description of the services within this vertical..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#FF6500]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Save to Database"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Editor Drawer */}
      {selectedCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <form onSubmit={handleUpdateCategory} className="bg-white h-full max-w-md w-full p-6 shadow-2xl space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#0B192C]">{selectedCat.name}</h3>
                <span className="text-xs text-gray-400 font-mono">Taxonomy Node #{selectedCat.id}</span>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedCat(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Display Name</label>
                <input 
                  type="text" 
                  value={selectedCat.name} 
                  onChange={(e) => setSelectedCat({ ...selectedCat, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">URL Slug</label>
                <input 
                  type="text" 
                  value={selectedCat.slug} 
                  onChange={(e) => setSelectedCat({ ...selectedCat, slug: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-xs" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea 
                  value={selectedCat.description || ""} 
                  onChange={(e) => setSelectedCat({ ...selectedCat, description: e.target.value })}
                  rows={3} 
                  className="w-full px-3 py-2 border rounded-lg text-sm" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Intake Flow Template</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option>Standard Question Intake + Time Slot Picker</option>
                  <option>Rides: Pickup & Drop Geo-Pin Selection</option>
                  <option>Construction: Multi-Stage BOQ Submission</option>
                  <option>Shift Manpower: Quantity & Duty Roster</option>
                </select>
              </div>
            </div>

            <div className="pt-6 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCat(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#FF6500] text-white hover:bg-[#E35B00] disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Category"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
