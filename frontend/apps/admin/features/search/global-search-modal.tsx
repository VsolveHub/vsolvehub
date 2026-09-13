"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, X, User, Briefcase, Calendar, FileText, 
  CreditCard, History, Clock, ArrowRight, CornerDownLeft, 
  ExternalLink, Sparkles, Filter 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export interface SearchMatchItem {
  id: string;
  title: string;
  subtitle: string;
  type: "CUSTOMER" | "PARTNER" | "BOOKING" | "QUOTE" | "PAYMENT" | "AUDIT" | "NAV";
  url: string;
  status?: string;
}

interface GlobalSearchResponse {
  query: string;
  customers: SearchMatchItem[];
  partners: SearchMatchItem[];
  bookings: SearchMatchItem[];
  quotes: SearchMatchItem[];
  payments: SearchMatchItem[];
  audit_logs: SearchMatchItem[];
  total_matches: number;
}

const NAV_SHORTCUTS: SearchMatchItem[] = [
  { id: "nav-home", title: "Home Command Center", subtitle: "Operational KPIs & live health", type: "NAV", url: "/" },
  { id: "nav-liveops", title: "Live Operations Radar", subtitle: "Geospatial tracking & duty map", type: "NAV", url: "/operations/live-ops" },
  { id: "nav-approvals", title: "Approval Center", subtitle: "Four-eyes dual authorizations", type: "NAV", url: "/operations/approvals" },
  { id: "nav-customers", title: "Customer 360° Profiles", subtitle: "User accounts & loyalty", type: "NAV", url: "/operations/customers" },
  { id: "nav-partners", title: "Partner & Vendor Directory", subtitle: "14 provider personas", type: "NAV", url: "/operations/partners" },
  { id: "nav-kyc", title: "KYC Verification Hub", subtitle: "Document inspection & SLAs", type: "NAV", url: "/operations/kyc" },
  { id: "nav-bookings", title: "Universal Bookings Engine", subtitle: "10-stage lifecycle & overrides", type: "NAV", url: "/operations/bookings" },
  { id: "nav-quotes", title: "Universal Quotes Hub", subtitle: "Multi-vertical RFQs & bidding", type: "NAV", url: "/operations/quotes" },
  { id: "nav-boq", title: "Quotation & BOQ Builder", subtitle: "Materials, labour & margins", type: "NAV", url: "/operations/quotes/builder" },
  { id: "nav-payments", title: "Payment Clearinghouse", subtitle: "Gateway reconciliations", type: "NAV", url: "/operations/payments" },
  { id: "nav-settlements", title: "Settlement Waterfall", subtitle: "TDS, platform fee & net payouts", type: "NAV", url: "/operations/settlements" },
  { id: "nav-vcoins", title: "V Coins Virtual Wallet", subtitle: "Loyalty balances & adjustments", type: "NAV", url: "/operations/v-coins" },
  { id: "nav-fraud", title: "Fraud & Risk Center", subtitle: "Velocity abuse & anomalies", type: "NAV", url: "/operations/fraud-risk" },
  { id: "nav-audit", title: "Immutable Audit Trail", subtitle: "Complete system change history", type: "NAV", url: "/operations/audit-logs" },
  { id: "nav-ai", title: "AI Copilot & Workflows", subtitle: "Platform intelligence queries", type: "NAV", url: "/operations/ai-control" },
  { id: "nav-health", title: "Infrastructure Health", subtitle: "Postgres, Redis, Razorpay probes", type: "NAV", url: "/operations/system-health" },
  { id: "nav-timeline", title: "Unified Activity Timeline", subtitle: "Chronological operational event stream", type: "NAV", url: "/operations/timeline" },
];

export function GlobalSearchModal({
  isOpen,
  onClose,
  onOpenTimeline,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenTimeline: (entityType: string, entityId: string, title: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminFetch<GlobalSearchResponse>(
          `/api/v1/admin/global-search/?q=${encodeURIComponent(query.trim())}`
        );
        setResults(res);
      } catch (err) {
        console.error("Global search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter items based on active tab
  const matchingNavs = NAV_SHORTCUTS.filter(
    (n) =>
      !query.trim() ||
      n.title.toLowerCase().includes(query.toLowerCase()) ||
      n.subtitle.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  const allItems: SearchMatchItem[] = [];
  if (results) {
    if (activeTab === "ALL" || activeTab === "CUSTOMERS") allItems.push(...results.customers);
    if (activeTab === "ALL" || activeTab === "PARTNERS") allItems.push(...results.partners);
    if (activeTab === "ALL" || activeTab === "BOOKINGS") allItems.push(...results.bookings);
    if (activeTab === "ALL" || activeTab === "QUOTES") allItems.push(...results.quotes);
    if (activeTab === "ALL" || activeTab === "PAYMENTS") allItems.push(...results.payments);
    if (activeTab === "ALL" || activeTab === "AUDIT") allItems.push(...results.audit_logs);
  }
  if (activeTab === "ALL" || activeTab === "NAV") {
    allItems.push(...matchingNavs);
  }

  function handleNavigate(url: string) {
    onClose();
    router.push(url);
  }

  function getTypeIcon(type: SearchMatchItem["type"]) {
    switch (type) {
      case "CUSTOMER": return <User className="w-4 h-4 text-blue-400" />;
      case "PARTNER": return <Briefcase className="w-4 h-4 text-emerald-400" />;
      case "BOOKING": return <Calendar className="w-4 h-4 text-amber-400" />;
      case "QUOTE": return <FileText className="w-4 h-4 text-indigo-400" />;
      case "PAYMENT": return <CreditCard className="w-4 h-4 text-green-400" />;
      case "AUDIT": return <History className="w-4 h-4 text-purple-400" />;
      case "NAV": return <ArrowRight className="w-4 h-4 text-[#FF6500]" />;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-[#0B192C] text-white border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800">
          <Search className="w-5 h-5 text-[#FF6500] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Universal search: Phone, Name, Order ID, Vehicle, Txn, Pincode..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-gray-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-mono bg-gray-800 text-gray-400 rounded border border-gray-700">
            ESC to close
          </kbd>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 px-4 py-2 bg-[#1E3E62]/40 border-b border-gray-800 text-xs overflow-x-auto">
          {["ALL", "CUSTOMERS", "PARTNERS", "BOOKINGS", "QUOTES", "PAYMENTS", "AUDIT", "NAV"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "bg-[#FF6500] text-white"
                  : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-gray-800/50">
          {loading && (
            <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-[#FF6500] border-t-transparent rounded-full animate-spin" />
              Searching indexed database records...
            </div>
          )}

          {!loading && allItems.length === 0 && query.trim().length >= 2 && (
            <div className="p-8 text-center text-xs text-gray-400">
              No matching records found for &ldquo;<span className="text-white font-medium">{query}</span>&rdquo;.
            </div>
          )}

          {!loading && allItems.length === 0 && !query.trim() && (
            <div className="p-6 text-center text-xs text-gray-400 space-y-2">
              <p className="font-medium text-gray-300">Type to search across the entire super app</p>
              <p className="text-[11px] text-gray-500">
                Search customers by phone, partners by trade, bookings by ID, or jump to system modules.
              </p>
            </div>
          )}

          {!loading && allItems.map((item, idx) => (
            <div
              key={`${item.type}-${item.id}-${idx}`}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1E3E62]/50 transition-colors group cursor-pointer"
              onClick={() => handleNavigate(item.url)}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="p-2 rounded-lg bg-gray-800/80 border border-gray-700/60 shrink-0">
                  {getTypeIcon(item.type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white truncate group-hover:text-[#FF6500] transition-colors">
                      {item.title}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 border border-gray-700 shrink-0">
                      {item.type}
                    </span>
                    {item.status && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800 shrink-0">
                        {item.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              {/* Actions: View Timeline or Open */}
              <div className="flex items-center gap-2 shrink-0">
                {item.type !== "NAV" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onOpenTimeline(item.type.toLowerCase(), item.id, item.title);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-300 hover:text-white bg-indigo-950/50 hover:bg-indigo-900/60 rounded-md border border-indigo-700/60 transition-colors"
                    title="View Chronological Activity Timeline"
                  >
                    <Clock className="w-3 h-3" />
                    <span className="hidden sm:inline">Timeline</span>
                  </button>
                )}
                <span className="text-gray-400 group-hover:text-white p-1">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#081220] border-t border-gray-800 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[10px]">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[10px]">Tab</kbd> Filter
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTimeline("all", "", "Platform Activity Stream");
            }}
            className="flex items-center gap-1.5 text-[#FF6500] hover:underline font-medium"
          >
            <Clock className="w-3.5 h-3.5" />
            Open Master Activity Timeline (§49)
          </button>
        </div>
      </div>
    </div>
  );
}
