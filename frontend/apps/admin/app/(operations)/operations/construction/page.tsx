"use client";

import { useState } from "react";
import { 
  Building, CheckCircle2, Clock, Camera, FileCheck, 
  IndianRupee, ShieldCheck, ArrowRight, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface ConstructionProject {
  id: string;
  name: string;
  client: string;
  contractor: string;
  current_milestone: string;
  progress_pct: number;
  escrow_locked_inr: number;
  architect_approved: boolean;
}

export default function ConstructionControlCenterPage() {
  const [projects, setProjects] = useState<ConstructionProject[]>([
    { id: "c_1", name: "Villa Nova G+2 Residential", client: "Dr. K. S. Rao", contractor: "Apex Civil Constructions", current_milestone: "Roof Slab Casting (Stage 3/6)", progress_pct: 55, escrow_locked_inr: 850000, architect_approved: true },
    { id: "c_2", name: "Madhapur Commercial Complex Interior", client: "TechCorp Labs", contractor: "Signature Spaces Pvt Ltd", current_milestone: "False Ceiling & HVAC Ducting", progress_pct: 70, escrow_locked_inr: 1200000, architect_approved: true },
    { id: "c_3", name: "Jubilee Hills Luxury Renovation", client: "Anand Reddy", contractor: "Heritage Craft Homes", current_milestone: "Brick Masonry & Electrical Rough-in", progress_pct: 35, escrow_locked_inr: 450000, architect_approved: false },
  ]);

  const [actingId, setActingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleApproveMilestone(p: ConstructionProject) {
    setActingId(p.id);
    try {
      await adminFetch("/api/v1/admin/verticals-overview/", {
        method: "POST",
        body: JSON.stringify({
          action: "APPROVE_CONSTRUCTION_MILESTONE",
          target_id: p.id,
          contractor: p.contractor,
          escrow_released_inr: p.escrow_locked_inr,
          reason: "Architect sign-off verified and escrow disbursed to contractor bank account",
        }),
      });

      setProjects(projects.map(proj => 
        proj.id === p.id ? { ...proj, architect_approved: true, progress_pct: Math.min(100, proj.progress_pct + 15) } : proj
      ));

      setSuccessMsg(`Milestone approved for ${p.name}. ₹${p.escrow_locked_inr.toLocaleString()} escrow disbursed and logged.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §21 SERVICES
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Construction & Civil Project Control Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Stage-gate milestone tracking, photo proof inspections, architect certifications, and escrow fund releases.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Projects Grid */}
      <div className="space-y-4">
        {projects.map((p) => (
          <div key={p.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-[#0B192C]">{p.name}</h3>
                <span className="text-xs text-gray-500">
                  Client: <strong>{p.client}</strong> • General Contractor: <strong>{p.contractor}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                  Escrow: ₹{p.escrow_locked_inr.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-700">Milestone: {p.current_milestone}</span>
                <span className="text-[#FF6500]">{p.progress_pct}% Completed</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-[#FF6500] h-full rounded-full transition-all" 
                  style={{ width: `${p.progress_pct}%` }} 
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-gray-600">
                  <Camera className="w-4 h-4 text-blue-600" /> 18 Progress Photos
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  {p.architect_approved ? "Architect Certified" : "Awaiting Site Inspection"}
                </span>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  type="button"
                  onClick={() => handleApproveMilestone(p)}
                  disabled={actingId === p.id}
                  className="px-3 py-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {actingId === p.id && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {actingId === p.id ? "Releasing..." : "Approve Milestone & Release Escrow"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
