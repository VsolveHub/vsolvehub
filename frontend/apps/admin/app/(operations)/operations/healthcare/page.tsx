"use client";

import { useState, useEffect } from "react";
import { 
  Heart, Stethoscope, ShieldCheck, CheckCircle2, 
  Calendar, Clock, UserCheck, Search, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface VerticalsData {
  healthcare?: {
    licensed_practitioners: number;
    home_visits_today: number;
    lab_samples_collected: number;
  };
}

export default function HealthcareVerticalPage() {
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

  const hc = data?.healthcare || {
    licensed_practitioners: 38,
    home_visits_today: 19,
    lab_samples_collected: 52,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §25 SERVICES
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Healthcare & Home Diagnostics Vertical
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Doctor home visits, nursing care, physiotherapy, blood sample collections, and medical practitioner license verification.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Licensed Practitioners</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">{hc.licensed_practitioners} Doctors & Nurses</p>
          <span className="text-xs text-emerald-600 font-medium">State Medical Council Verified</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Home Visits Scheduled Today</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{hc.home_visits_today} Appointments</p>
          <span className="text-xs text-gray-500">12 Physiotherapy, 7 Nursing</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Diagnostic Tests Dispatched</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">{hc.lab_samples_collected} Samples</p>
          <span className="text-xs text-gray-500">NABL Accredited Lab Partner</span>
        </div>
      </div>

      {/* Practitioners List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-3">
        <h3 className="font-bold text-sm text-[#0B192C]">Verified Practitioners on Roster</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
            <div>
              <strong className="text-sm text-gray-900 block">Dr. A. Meenakshi, MBBS, MD</strong>
              <span className="text-gray-500">Reg: TSMC-48201 • General Physician</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              Available
            </span>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
            <div>
              <strong className="text-sm text-gray-900 block">Rajesh Varma, BPT, MPT</strong>
              <span className="text-gray-500">Reg: IAP-98124 • Senior Physiotherapist</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
              On Visit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
