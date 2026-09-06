"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { apiFetch } from "@vsolve/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface RentalBooking {
  id: string;
  asset_id: string;
  asset_title: string;
  vendor_name: string;
  assigned_serial: string;
  rental_start: string;
  rental_end: string;
  status: string;
  deposit?: {
    id: string;
    amount_paise: number;
    status: string;
    consumed_amount_paise: number;
    refunded_amount_paise: number;
  };
}

export default function AdminRentalsOversightPage() {
  const [bookings, setBookings] = useState<RentalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");

  // Reassignment Modal State
  const [reassignBooking, setReassignBooking] = useState<RentalBooking | null>(null);
  const [newAssetId, setNewAssetId] = useState("");
  const [submittingReassign, setSubmittingReassign] = useState(false);

  async function loadBookings() {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/rentals/ops/bookings/`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setBookings(data);
    } catch {
      // Fallback demo bookings for preview
      setBookings([
        {
          id: "bk-demo-01",
          asset_id: "66102d56-8e63-44e1-ab01-6d23b9f2e447",
          asset_title: "Bosch Professional Hammer Drill (500W)",
          vendor_name: "Balaji Equipment & Tool Rentals",
          assigned_serial: "BOSCH-HD-8841",
          rental_start: "2026-09-04",
          rental_end: "2026-09-06",
          status: "CONFIRMED",
          deposit: {
            id: "dep-01",
            amount_paise: 100000,
            status: "AUTHORIZED",
            consumed_amount_paise: 0,
            refunded_amount_paise: 0,
          },
        },
        {
          id: "bk-demo-02",
          asset_id: "b83280a8-5b14-4b33-98a5-a7e0e4dadd2e",
          asset_title: "Heavy Duty Concrete Mixer 10/7",
          vendor_name: "Balaji Equipment & Tool Rentals",
          assigned_serial: "CM-107-HYD-01",
          rental_start: "2026-09-01",
          rental_end: "2026-09-03",
          status: "DISPUTED",
          deposit: {
            id: "dep-02",
            amount_paise: 500000,
            status: "DISPUTED",
            consumed_amount_paise: 0,
            refunded_amount_paise: 0,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function handleExecuteReassignment() {
    if (!reassignBooking || !newAssetId) return;
    setSubmittingReassign(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/rentals/ops/bookings/${reassignBooking.id}/reassign/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_asset_id: newAssetId }),
      });
      if (!res.ok) throw new Error("Reassignment refused");
      setReassignBooking(null);
      setNewAssetId("");
      await loadBookings();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingReassign(false);
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (filter === "ALL") return true;
    return b.status === filter;
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-bold uppercase text-amber-800">
            A7 Archetype Oversight
          </span>
          <h1 className="mt-1 text-2xl font-black text-neutral-900">Rental Services Recovery & Operations</h1>
          <p className="text-xs text-neutral-500">
            Platform-wide management of equipment holds, pre-handover asset reassignments, and deposit dispute cases.
          </p>
        </div>

        <button
          onClick={loadBookings}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Queue
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 border-b border-neutral-200 pb-3">
        {["ALL", "CONFIRMED", "ACTIVE", "DISPUTED", "COMPLETED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-all ${
              filter === st
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 font-bold uppercase text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="p-4">Rental Booking</th>
              <th className="p-4">Asset & Unit Serial</th>
              <th className="p-4">Vendor</th>
              <th className="p-4">Schedule</th>
              <th className="p-4">Deposit Status</th>
              <th className="p-4">Status</th>
              <th className="p-4">Ops Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredBookings.map((b) => (
              <tr key={b.id} className="hover:bg-neutral-50/50">
                <td className="p-4 font-mono font-bold text-neutral-900">#{b.id.slice(0, 8)}</td>
                <td className="p-4">
                  <span className="font-bold text-neutral-900 block">{b.asset_title}</span>
                  <span className="font-mono text-[11px] text-neutral-500">
                    Serial: {b.assigned_serial || "Unassigned"}
                  </span>
                </td>
                <td className="p-4 text-neutral-700">{b.vendor_name}</td>
                <td className="p-4 text-neutral-600">
                  {b.rental_start} &rarr; {b.rental_end}
                </td>
                <td className="p-4">
                  {b.deposit ? (
                    <div>
                      <span className="font-bold text-neutral-900 block">
                        ₹{(b.deposit.amount_paise / 100).toLocaleString("en-IN")}
                      </span>
                      <span className="text-[11px] text-neutral-500 uppercase">{b.deposit.status}</span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                      b.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : b.status === "DISPUTED"
                        ? "bg-red-100 text-red-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    ● {b.status}
                  </span>
                </td>
                <td className="p-4">
                  {b.status === "CONFIRMED" && (
                    <button
                      onClick={() => setReassignBooking(b)}
                      className="rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-800 hover:bg-neutral-200"
                    >
                      Reassign Asset
                    </button>
                  )}
                  {b.status === "DISPUTED" && (
                    <Link
                      href={`/operations/cases`}
                      className="rounded bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-200 inline-block"
                    >
                      Resolve in Cases &rarr;
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reassignment Modal */}
      {reassignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-xs">
            <h3 className="text-base font-bold text-neutral-900">Pre-Handover Asset Reassignment</h3>
            <p className="mt-1 text-neutral-500">
              Reassign Booking #{reassignBooking.id.slice(0, 8)} to an equivalent active asset.
            </p>

            <div className="mt-4">
              <label className="block font-semibold text-neutral-700">Target Replacement Asset UUID</label>
              <input
                type="text"
                value={newAssetId}
                onChange={(e) => setNewAssetId(e.target.value)}
                placeholder="UUID of equivalent unit"
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setReassignBooking(null)}
                className="rounded-lg px-3 py-1.5 font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                disabled={submittingReassign || !newAssetId}
                onClick={handleExecuteReassignment}
                className="rounded-lg bg-neutral-900 px-4 py-1.5 font-bold text-white hover:bg-black disabled:opacity-50"
              >
                {submittingReassign ? "Reassigning..." : "Execute Reassignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
