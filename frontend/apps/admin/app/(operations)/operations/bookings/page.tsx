"use client";

import { useState, useEffect } from "react";
import { 
  Calendar, CheckCircle2, Clock, Search, 
  MapPin, AlertCircle, RefreshCw, Eye, ShieldAlert, ArrowUpRight 
} from "lucide-react";
import Link from "next/link";
import { adminFetch } from "@/lib/api/admin-fetch";

interface BookingRecord {
  id: string;
  order_id: string;
  customer_phone: string;
  partner_name: string;
  partner_phone: string;
  status: string;
  scheduled_start: string | null;
  estimated_duration_minutes: number;
  created_at: string;
}

export default function BookingsLifecyclePage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [overrideAction, setOverrideAction] = useState("FORCE_COMPLETE");
  const [overrideReason, setOverrideReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadBookings() {
    setLoading(true);
    setActionError(null);
    try {
      const data = await adminFetch<{ bookings: BookingRecord[] }>("/api/v1/admin/bookings/");
      setBookings(data.bookings || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load live bookings from server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function handleExecuteOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBooking) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await adminFetch("/api/v1/admin/bookings/", {
        method: "POST",
        data: {
          booking_id: selectedBooking.id,
          action: overrideAction,
          reason: overrideReason || "Supervisor state machine override",
        },
      });
      setActionSuccess(`Override executed successfully for ${selectedBooking.order_id}.`);
      setSelectedBooking(null);
      setOverrideReason("");
      await loadBookings();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || "Failed to execute supervisor override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const filtered = bookings.filter((b) => {
    const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
    const matchesSearch = 
      b.customer_phone.toLowerCase().includes(search.toLowerCase()) ||
      b.partner_name.toLowerCase().includes(search.toLowerCase()) ||
      b.order_id.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              FULFILMENT
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Universal Booking Lifecycle Board
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time state machine tracker across all 10 canonical lifecycle stages with supervisor override capability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations/dispatch"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#0B192C] hover:bg-[#1E3E62] rounded-lg shadow-sm transition-colors"
          >
            Live Dispatch Board <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer, partner or order ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {["ALL", "PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                statusFilter === st ? "bg-[#0B192C] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
              <th className="px-5 py-3.5">Order / Booking ID</th>
              <th className="px-5 py-3.5">Customer</th>
              <th className="px-5 py-3.5">Assigned Partner</th>
              <th className="px-5 py-3.5">Scheduled Slot</th>
              <th className="px-5 py-3.5">Current State</th>
              <th className="px-5 py-3.5 text-right">Supervisor Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Connecting to Bookings Engine...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  No bookings found matching filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-mono font-medium text-[#0B192C]">
                    {b.order_id}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-gray-700">
                    {b.customer_phone}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900">{b.partner_name}</div>
                    <div className="text-xs text-gray-500 font-mono">{b.partner_phone}</div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 text-xs">
                    {b.scheduled_start ? new Date(b.scheduled_start).toLocaleString() : "Immediate Dispatch"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      b.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
                      b.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" :
                      b.status === "ASSIGNED" ? "bg-indigo-100 text-indigo-800" :
                      b.status === "CANCELLED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedBooking(b)}
                      className="px-3 py-1 text-xs font-semibold bg-gray-100 hover:bg-[#0B192C] hover:text-white rounded-md transition-colors cursor-pointer"
                    >
                      Override
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Override Action Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form onSubmit={handleExecuteOverride} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-[#0B192C]">
                Administrative Override: {selectedBooking.order_id}
              </h3>
              <button type="button" onClick={() => setSelectedBooking(null)} className="text-gray-400 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs text-gray-700">
              <p>Current State: <strong>{selectedBooking.status}</strong></p>
              <div className="p-3 bg-amber-50 rounded-lg text-amber-800 flex items-start gap-2 border border-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>All state machine overrides write directly to the immutable AdminAuditLog with supervisor tag.</span>
              </div>
              <div>
                <label className="block font-semibold mb-1">Select Override Action:</label>
                <select 
                  value={overrideAction} 
                  onChange={e => setOverrideAction(e.target.value)} 
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="FORCE_COMPLETE">Force Mark Complete & Settle</option>
                  <option value="CANCEL_REFUND">Emergency Cancel with 100% Full Refund</option>
                  <option value="REASSIGN">Force Reassign to Nearest Available Partner</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Supervisor Reason / Audit Justification:</label>
                <input 
                  type="text" 
                  value={overrideReason} 
                  onChange={e => setOverrideReason(e.target.value)} 
                  placeholder="e.g. Customer confirmed job completed on call" 
                  className="w-full p-2 border rounded-lg text-xs" 
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setSelectedBooking(null)} className="px-4 py-2 text-xs rounded-lg bg-gray-100 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer">
                {isSubmitting ? "Executing..." : "Execute Override"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
