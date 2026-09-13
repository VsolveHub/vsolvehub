"use client";

import { useState, useEffect } from "react";
import { 
  Camera, Music, Sparkles, Calendar, CheckCircle2, 
  Search, ArrowRight, Eye, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface VerticalsData {
  events?: {
    scheduled_events_this_week: number;
    top_service: string;
  };
}

export default function EventsMediaPage() {
  const [data, setData] = useState<VerticalsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const scheduledEvents = data?.events?.scheduled_events_this_week ?? 14;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §26 SERVICES
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Events, Decor & Media Production Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Orchestrate premium event services: Candid photographers, cinematic videographers, drone pilots, stage decor, sound/lighting, and catering.
          </p>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Calendar className="w-3.5 h-3.5 text-purple-600" />
            {scheduledEvents} Productions Booked This Week
          </span>
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Photography & Drone</h3>
              <p className="text-xs text-gray-500">Sony Alpha A7IV + DJI Mavic 3</p>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            14 Verified cinematographers with high-end camera packages available for booking.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Floral & Stage Decor</h3>
              <p className="text-xs text-gray-500">Theme setups & Mandap styling</p>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            6 Specialized event decor agencies with custom 3D walkthrough renderings.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0B192C]">Audio & Concert Lighting</h3>
              <p className="text-xs text-gray-500">JBL Line Array + Sharpy Lights</p>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Turnkey sound engineers for corporate conferences and wedding receptions.
          </p>
        </div>
      </div>
    </div>
  );
}
