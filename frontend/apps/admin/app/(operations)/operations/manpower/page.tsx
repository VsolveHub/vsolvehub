"use client";

import { useState, useEffect } from "react";
import { 
  Users, CheckCircle2, Clock, Calendar, 
  ArrowRight, ShieldCheck, UserCheck, RefreshCw 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface ShiftBatch {
  id: string;
  client: string;
  role: string;
  workers_required: number;
  workers_deployed: number;
  shift_time: string;
  location: string;
  attendance_pct: number;
  status: string;
}

export default function ManpowerManagementPage() {
  const [shifts, setShifts] = useState<ShiftBatch[]>([
    { id: "s1", client: "Amazon Fulfilment Center", role: "Warehouse Loading Staff", workers_required: 40, workers_deployed: 40, shift_time: "08:00 AM - 05:00 PM", location: "Shamshabad Logistics Park", attendance_pct: 97.5, status: "ON_DUTY" },
    { id: "s2", client: "Novotel HICC Convention", role: "Event Security & Hospitality", workers_required: 25, workers_deployed: 25, shift_time: "02:00 PM - 11:00 PM", location: "HITEC City Convention", attendance_pct: 100, status: "READY" },
    { id: "s3", client: "L&T Metro Rail Station", role: "Civil Maintenance Labour", workers_required: 18, workers_deployed: 16, shift_time: "10:00 PM - 06:00 AM", location: "Ameerpet Interchange", attendance_pct: 88.9, status: "ASSIGNING" },
  ]);

  const [actingId, setActingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleVerifyAttendance(shift: ShiftBatch) {
    setActingId(shift.id);
    try {
      await adminFetch("/api/v1/admin/verticals-overview/", {
        method: "POST",
        body: JSON.stringify({
          action: "VERIFY_SHIFT_ATTENDANCE",
          target_id: shift.id,
          client: shift.client,
          deployed: shift.workers_deployed,
        }),
      });

      setShifts(shifts.map(s => 
        s.id === shift.id ? { ...s, attendance_pct: 100, status: "VERIFIED" } : s
      ));

      setSuccessMsg(`Attendance verified for ${shift.client} (${shift.role}).`);
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
              §22 SERVICES
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Workforce & Bulk Manpower Management
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            7-stage workforce pipeline: Requirement → Candidate Pool → Duty Assignment → Daily Shift Attendance → Payroll Disbursal.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Active Shift Personnel</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">142 Workers</p>
          <span className="text-xs text-gray-500">Across 24 active commercial rosters</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Attendance Verification</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">97.4% Present</p>
          <span className="text-xs text-emerald-600 font-medium">OTP & Geo-Fence Checkin</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Daily Payroll Liability</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">₹1,14,500</p>
          <span className="text-xs text-gray-500">Net direct bank payout</span>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Client & Role</th>
              <th className="px-5 py-3.5">Site Location</th>
              <th className="px-5 py-3.5">Shift Window</th>
              <th className="px-5 py-3.5">Fulfillment</th>
              <th className="px-5 py-3.5">Attendance</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shifts.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-bold text-[#0B192C]">{s.client}</div>
                  <span className="text-xs text-gray-500">{s.role}</span>
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-700">
                  {s.location}
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-600 font-mono">
                  {s.shift_time}
                </td>
                <td className="px-5 py-3.5 font-bold font-mono text-gray-800">
                  {s.workers_deployed} / {s.workers_required}
                </td>
                <td className="px-5 py-3.5 font-mono text-emerald-700 font-bold">
                  {s.attendance_pct}%
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    disabled={actingId === s.id}
                    onClick={() => handleVerifyAttendance(s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {s.status === "VERIFIED" ? "Verified" : "Verify Roster"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
