"use client";

import React, { useState, useEffect } from "react";
import { 
  Clock, Shield, User, Briefcase, Calendar, 
  CreditCard, Headphones, RefreshCw, Filter, 
  Search, FileCode, ChevronDown, ChevronUp, CheckCircle2 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface TimelineEvent {
  id: string;
  timestamp: string;
  formatted_time: string;
  event_type: "AUDIT_LOG" | "SUPPORT_CASE" | "STATE_TRANSITION" | "PAYMENT";
  action: string;
  actor: string;
  summary: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  tone: "info" | "success" | "warning" | "danger";
}

interface ActivityTimelineResponse {
  entity_type: string;
  entity_id: string | null;
  timeline: TimelineEvent[];
  total_events: number;
}

export default function ActivityTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  async function loadTimeline() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityFilter !== "all") params.set("entity_type", entityFilter);
      if (searchFilter.trim()) params.set("entity_id", searchFilter.trim());

      const res = await adminFetch<ActivityTimelineResponse>(
        `/api/v1/admin/activity-timeline/?${params.toString()}`
      );
      setEvents(res.timeline || []);
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, [entityFilter]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredEvents = events.filter((e) => {
    if (!searchFilter.trim()) return true;
    const s = searchFilter.toLowerCase();
    return (
      e.summary.toLowerCase().includes(s) ||
      e.actor.toLowerCase().includes(s) ||
      e.action.toLowerCase().includes(s) ||
      e.entity_id.toLowerCase().includes(s)
    );
  });

  function getToneClass(tone: TimelineEvent["tone"]) {
    switch (tone) {
      case "success": return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "warning": return "bg-amber-50 text-amber-800 border-amber-200";
      case "danger": return "bg-rose-50 text-rose-800 border-rose-200";
      default: return "bg-blue-50 text-blue-800 border-blue-200";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §49 COMMAND CENTER
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Universal Chronological Activity Timeline
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time unified audit stream unifying mutations, administrative overrides, tickets, and transactions across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTimeline}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0B192C] bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF6500]" : ""}`} />
            Refresh Stream
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-700">Entity:</span>
          {[
            { id: "all", label: "All Activity" },
            { id: "customer", label: "Customers" },
            { id: "partner", label: "Partners" },
            { id: "booking", label: "Bookings" },
            { id: "pricing", label: "Pricing & Fees" },
            { id: "case", label: "Support Cases" },
            { id: "system", label: "System Changes" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setEntityFilter(cat.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                entityFilter === cat.id
                  ? "bg-[#0B192C] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search stream / ID..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#FF6500]"
          />
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
        {loading && (
          <div className="py-16 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-[#FF6500] border-t-transparent rounded-full animate-spin" />
            Loading real-time chronological event trail...
          </div>
        )}

        {!loading && filteredEvents.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-500">
            No events found matching the active filter criteria.
          </div>
        )}

        {!loading && filteredEvents.length > 0 && (
          <div className="relative border-l-2 border-gray-200 ml-4 space-y-6 pl-6">
            {filteredEvents.map((event) => {
              const isExpanded = expandedIds.has(event.id);
              const hasDetails = event.details && Object.keys(event.details).length > 0;

              return (
                <div key={event.id} className="relative group">
                  {/* Node Icon */}
                  <div className="absolute -left-[33px] top-1.5 h-6 w-6 rounded-full bg-white border-2 border-[#0B192C] flex items-center justify-center group-hover:border-[#FF6500] transition-colors shadow-xs">
                    <Clock className="w-3 h-3 text-[#FF6500]" />
                  </div>

                  {/* Card Content */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getToneClass(event.tone)}`}>
                            {event.action}
                          </span>
                          <span className="text-xs font-semibold text-[#0B192C]">
                            {event.actor}
                          </span>
                          <span className="text-xs text-gray-400">
                            · {event.formatted_time}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mt-2">
                          {event.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                          <span>Target: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">{event.entity_type}:{event.entity_id}</code></span>
                        </div>
                      </div>

                      {hasDetails && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(event.id)}
                          className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200 shrink-0"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>Payload</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    {/* Expandable JSON Payload */}
                    {isExpanded && hasDetails && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <pre className="text-xs font-mono bg-[#0B192C] text-gray-200 p-3 rounded-lg overflow-x-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
