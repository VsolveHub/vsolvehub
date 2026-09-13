"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  FileSpreadsheet, Plus, CheckCircle2, Clock, 
  Search, RefreshCw, Eye, ArrowUpRight, Building 
} from "lucide-react";

import { adminFetch } from "@/lib/api/admin-fetch";

interface QuoteItem {
  id: string;
  customer_phone: string;
  vertical: string;
  title: string;
  status: string;
  city: string;
  pincode: string;
  quotes_count: number;
  created_at: string;
}

export default function QuotesManagementPage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadQuotes() {
      try {
        const res = await adminFetch("/api/v1/admin/quotes/");
        if (res.ok) {
          const data = await res.json();
          setQuotes(data.quotes || []);
        }
      } catch (e) {
        console.error("Failed to load quotes", e);
      } finally {
        setLoading(false);
      }
    }
    loadQuotes();
  }, []);

  const filtered = quotes.filter((q) =>
    q.title.toLowerCase().includes(search.toLowerCase()) ||
    q.vertical.toLowerCase().includes(search.toLowerCase()) ||
    q.customer_phone.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §10 MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Universal Quote & Project Request Hub
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage high-value multi-contractor bids across 13 complex verticals: Construction, Interiors, Solar, Staging, and Heavy Equipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations/quotes/builder"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Standardized BOQ
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Active RFQ Projects</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">{quotes.length} RFQs</p>
          <span className="text-xs text-emerald-600 font-medium">Bids in progress</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Average Bids per Job</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">3.5 Vendors</p>
          <span className="text-xs text-gray-500">Competitive rate discovery</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Gross Project Pipeline</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">₹1.48 Cr</p>
          <span className="text-xs text-emerald-600 font-medium">+18% this month</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">BOQ Approval SLA</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">&lt; 12 Hours</p>
          <span className="text-xs text-gray-500">Architect review speed</span>
        </div>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search project title or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Project & Vertical</th>
              <th className="px-5 py-3.5">Customer Contact</th>
              <th className="px-5 py-3.5">Location</th>
              <th className="px-5 py-3.5">Vendor Bids</th>
              <th className="px-5 py-3.5">Pipeline State</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Loading quotation pipeline...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  No quotes found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-[#0B192C]">{q.title}</div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                      {q.vertical}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-gray-800">
                    {q.customer_phone}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-600">
                    {q.city} — {q.pincode}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-800">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      {q.quotes_count} Proposals
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      {q.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href="/operations/quotes/builder"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#0B192C] hover:bg-[#1E3E62] text-white rounded-lg transition-colors"
                    >
                      Inspect BOQ <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
