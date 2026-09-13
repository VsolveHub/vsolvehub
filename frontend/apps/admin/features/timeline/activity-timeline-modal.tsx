"use client";

import React, { useState, useEffect } from "react";
import { 
  Clock, X, RefreshCw, Shield, User, Briefcase, 
  Calendar, CreditCard, Headphones, AlertTriangle, 
  CheckCircle2, FileCode, ChevronDown, ChevronUp, Filter 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

export interface TimelineEvent {
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

export function ActivityTimelineModal({
  isOpen,
  onClose,
  entityType = "all",
  entityId = "",
  entityTitle = "Platform Activity Stream",
}: {
  isOpen: boolean;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
  entityTitle?: string;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  async function loadTimeline() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType && entityType !== "all") params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);

      const res = await adminFetch<ActivityTimelineResponse>(
        `/api/v1/admin/activity-timeline/?${params.toString()}`
      );
      setEvents(res.timeline || []);
    } catch (err) {
      console.error("Failed to load activity timeline:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadTimeline();
      setExpandedIds(new Set());
    }
  }, [isOpen, entityType, entityId]);

  if (!isOpen) return null;

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredEvents = events.filter((e) => {
    if (filterType === "ALL") return true;
    if (filterType === "AUDIT") return e.event_type === "AUDIT_LOG";
    if (filterType === "SUPPORT") return e.event_type === "SUPPORT_CASE";
    return true;
  });

  function getToneBadge(tone: TimelineEvent["tone"]) {
    switch (tone) {
      case "success":
        return "bg-emerald-950/60 text-emerald-400 border-emerald-800";
      case "warning":
        return "bg-amber-950/60 text-amber-400 border-amber-800";
      case "danger":
        return "bg-rose-950/60 text-rose-400 border-rose-800";
      default:
        return "bg-blue-950/60 text-blue-400 border-blue-800";
    }
  }

  function getEventIcon(eventType: TimelineEvent["event_type"]) {
    switch (eventType) {
      case "SUPPORT_CASE":
        return <Headphones className="w-3.5 h-3.5 text-amber-400" />;
      case "PAYMENT":
        return <CreditCard className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Shield className="w-3.5 h-3.5 text-blue-400" />;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-3xl bg-[#0B192C] text-white border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FF6500]/15 border border-[#FF6500]/30 text-[#FF6500]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FF6500]/20 text-[#FF6500]">
                  §49 TIMELINE
                </span>
                <h2 className="text-base font-bold tracking-tight text-white truncate max-w-md">
                  {entityTitle}
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Chronological unified event stream unifying all actor mutations & system transitions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadTimeline}
              disabled={loading}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              title="Refresh timeline"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF6500]" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between px-5 py-2 bg-[#1E3E62]/40 border-b border-gray-800 text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-400 text-[11px]">Filter:</span>
            {["ALL", "AUDIT", "SUPPORT"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  filterType === type
                    ? "bg-[#FF6500] text-white font-semibold"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400">
            {filteredEvents.length} chronological events recorded
          </span>
        </div>

        {/* Chronological Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-12 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-[#FF6500] border-t-transparent rounded-full animate-spin" />
              Loading chronological activity events...
            </div>
          )}

          {!loading && filteredEvents.length === 0 && (
            <div className="py-12 text-center text-xs text-gray-400">
              No activity logs or lifecycle events found for this selection.
            </div>
          )}

          {!loading && (
            <div className="relative border-l-2 border-gray-800 ml-4 space-y-6 pl-6">
              {filteredEvents.map((event) => {
                const isExpanded = expandedIds.has(event.id);
                const hasDetails = event.details && Object.keys(event.details).length > 0;

                return (
                  <div key={event.id} className="relative group">
                    {/* Circle Node */}
                    <div className="absolute -left-[31px] top-1 h-5 w-5 rounded-full bg-[#0B192C] border-2 border-gray-700 flex items-center justify-center group-hover:border-[#FF6500] transition-colors">
                      {getEventIcon(event.event_type)}
                    </div>

                    {/* Event Card */}
                    <div className="bg-[#1E3E62]/30 border border-gray-700/60 rounded-xl p-3 hover:border-gray-600 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getToneBadge(event.tone)}`}>
                              {event.action}
                            </span>
                            <span className="text-[11px] font-semibold text-[#FF6500]">
                              {event.actor}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              · {event.formatted_time}
                            </span>
                          </div>
                          <p className="text-xs text-white mt-1.5 font-medium leading-relaxed">
                            {event.summary}
                          </p>
                        </div>
                        {hasDetails && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(event.id)}
                            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 text-[11px] flex items-center gap-1 shrink-0"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {/* Expandable JSON details */}
                      {isExpanded && hasDetails && (
                        <div className="mt-3 pt-2.5 border-t border-gray-700/60 text-[11px] font-mono bg-[#081220] p-3 rounded-lg overflow-x-auto text-gray-300">
                          <pre>{JSON.stringify(event.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#081220] border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
          <span className="text-[11px]">
            Target: <code className="text-gray-200">{entityType}:{entityId || "global"}</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
