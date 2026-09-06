"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  ClipboardCheck,
} from "lucide-react";

import {
  usePartnerRentalBookings,
  useRecordReturnInspection,
  type RentalBooking,
} from "@/features/rentals/queries";

export default function PartnerRentalsInspectionsPage() {
  const { data: bookings, isLoading, isError, error } = usePartnerRentalBookings();
  const recordInspection = useRecordReturnInspection();

  // Inspection Modal State
  const [selectedBooking, setSelectedBooking] = useState<RentalBooking | null>(null);
  const [damageFound, setDamageFound] = useState(false);
  const [damageEstimatedRupees, setDamageEstimatedRupees] = useState(0);
  const [lateDays, setLateDays] = useState(0);
  const [conditionNotes, setConditionNotes] = useState("");

  async function handleSubmitInspection() {
    if (!selectedBooking) return;
    try {
      // TODO(rentals evidence upload): placeholder photo, same as the handover
      // modal — see the plan's Wave 6 for the real presign/verify/finalize flow.
      await recordInspection.mutateAsync({
        bookingId: selectedBooking.id,
        photo_urls: ["https://images.vsolve.com/return-proof.jpg"],
        condition_notes: conditionNotes,
        damage_found: damageFound,
        damage_estimated_paise: damageEstimatedRupees * 100,
        late_days: Number(lateDays),
      });
      setSelectedBooking(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record return inspection.");
    }
  }

  const eligibleBookings = (bookings ?? []).filter(
    (b) => b.status === "ACTIVE" || b.status === "RETURN_PENDING" || b.status === "RETURNED",
  );

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/rentals" className="flex items-center gap-1 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">
          Return Inspections & Settlement Matrix
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Perform inbound condition assessments on returned assets. Clean returns automatically release customer deposits and trigger your vendor payout immediately.
        </p>

        <div className="mt-8 space-y-4">
          {isLoading ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
              Loading returns queue...
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-red-600 flex flex-col items-center gap-2">
              <AlertCircle className="h-6 w-6" />
              {error instanceof Error ? error.message : "Unable to load bookings."}
            </div>
          ) : eligibleBookings.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
              No returned units pending inspection right now.
            </div>
          ) : (
            eligibleBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700 uppercase">
                      #{b.id.slice(0, 8)}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold uppercase text-emerald-800">
                      ● Ready for Inspection
                    </span>
                  </div>

                  <h3 className="mt-2 text-lg font-bold text-neutral-900">{b.asset_title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Scheduled Return: {b.rental_end}
                    </span>
                    {b.deposit && (
                      <span className="flex items-center gap-1 text-blue-700 font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Escrow Deposit: ₹{(b.deposit.amount_paise / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => {
                      setSelectedBooking(b);
                      setDamageFound(false);
                      setDamageEstimatedRupees(0);
                      setLateDays(0);
                      setConditionNotes("");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <ClipboardCheck className="h-4 w-4" /> Record Inspection & Settle
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Inspection Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Inbound Return Inspection</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Apply §4.5 Settlement Matrix. Clean returns release deposit and credit earnings.
            </p>

            <div className="mt-4 space-y-4 text-xs">
              {/* Damage toggle */}
              <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
                <label className="block font-bold text-neutral-900 mb-2">Equipment Condition Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="damage"
                      checked={!damageFound}
                      onChange={() => setDamageFound(false)}
                      className="text-action"
                    />
                    <span className="font-semibold text-emerald-700">Clean Return (No Damage)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="damage"
                      checked={damageFound}
                      onChange={() => setDamageFound(true)}
                      className="text-action"
                    />
                    <span className="font-semibold text-amber-700">Damage Noted</span>
                  </label>
                </div>
              </div>

              {damageFound && (
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Estimated Repair / Replacement Cost (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={damageEstimatedRupees}
                    onChange={(e) => setDamageEstimatedRupees(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-action focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Minor damage up to ₹5,000 is auto-approved and deducted from deposit. Claims over ₹5,000 trigger OperationsCase investigation.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700">Late Days (if returned past due)</label>
                <input
                  type="number"
                  min={0}
                  value={lateDays}
                  onChange={(e) => setLateDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-action focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Inspection Condition Notes</label>
                <textarea
                  rows={3}
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder="Describe condition of the returned unit..."
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-action focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                disabled={recordInspection.isPending}
                onClick={handleSubmitInspection}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {recordInspection.isPending ? "Executing Settlement..." : "Submit Inspection & Execute Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
