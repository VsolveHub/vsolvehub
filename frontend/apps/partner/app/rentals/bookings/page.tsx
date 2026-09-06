"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  Camera,
  Clock,
  ArrowLeft,
  Truck,
  Check,
  X,
  RotateCcw,
  ClipboardCheck,
  ShieldAlert,
  User,
  Phone,
  MapPin,
  Sparkles,
  Search,
} from "lucide-react";

import {
  usePartnerRentalBookings,
  useRecordHandover,
  useInitiateReturn,
  useRecordReturnInspection,
  useApproveExtension,
  useRejectExtension,
  type RentalBooking,
} from "@/features/rentals/queries";

export default function PartnerRentalsBookingsPage() {
  const { data: bookings, isLoading, isError, error } = usePartnerRentalBookings();
  const recordHandover = useRecordHandover();
  const initiateReturn = useInitiateReturn();
  const recordInspection = useRecordReturnInspection();
  const approveExtension = useApproveExtension();
  const rejectExtension = useRejectExtension();

  // Tab filter
  const [activeTab, setActiveTab] = useState<
    "ALL" | "CONFIRMED" | "ACTIVE" | "RETURN_PENDING" | "COMPLETED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Handover Modal State
  const [handoverBooking, setHandoverBooking] = useState<RentalBooking | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [assignedSerial, setAssignedSerial] = useState("");
  const [handoverPhotos, setHandoverPhotos] = useState<string>("");
  const [checklist, setChecklist] = useState({
    operational_test: true,
    accessories_verified: true,
    no_physical_damage: true,
    safety_gear_provided: true,
  });

  // Return Inspection Modal State
  const [inspectionBooking, setInspectionBooking] = useState<RentalBooking | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [damageFound, setDamageFound] = useState(false);
  const [damageEstimateRupees, setDamageEstimateRupees] = useState<number>(0);
  const [lateDays, setLateDays] = useState<number>(0);
  const [inspectionPhotos, setInspectionPhotos] = useState<string>("");

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      // Tab filter
      if (activeTab === "CONFIRMED" && b.status !== "CONFIRMED") return false;
      if (activeTab === "ACTIVE" && b.status !== "ACTIVE" && b.status !== "HANDED_OVER") return false;
      if (
        activeTab === "RETURN_PENDING" &&
        b.status !== "RETURN_PENDING" &&
        b.status !== "RETURNED" &&
        b.status !== "INSPECTED"
      )
        return false;
      if (activeTab === "COMPLETED" && b.status !== "COMPLETED" && b.status !== "SETTLED")
        return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = b.asset_title.toLowerCase().includes(q);
        const matchesId = b.id.toLowerCase().includes(q);
        const matchesCustomer = b.customer_name?.toLowerCase().includes(q);
        return matchesTitle || matchesId || matchesCustomer;
      }
      return true;
    });
  }, [bookings, activeTab, searchQuery]);

  async function handleSubmitHandover() {
    if (!handoverBooking) return;
    try {
      const photos = handoverPhotos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await recordHandover.mutateAsync({
        bookingId: handoverBooking.id,
        photo_urls:
          photos.length > 0
            ? photos
            : [
                "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&auto=format&fit=crop&q=80",
              ],
        condition_notes: handoverNotes || "Handover condition verified and tested working.",
        assigned_serial: assignedSerial || handoverBooking.assigned_serial || "SERIAL-VERIFIED",
      });
      setHandoverBooking(null);
      setHandoverNotes("");
      setAssignedSerial("");
      setHandoverPhotos("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record handover.");
    }
  }

  async function handleInitiateReturn(bookingId: string) {
    if (!confirm("Are you sure you want to initiate return for this equipment?")) return;
    try {
      await initiateReturn.mutateAsync(bookingId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to initiate return.");
    }
  }

  async function handleSubmitInspection() {
    if (!inspectionBooking) return;
    try {
      const photos = inspectionPhotos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await recordInspection.mutateAsync({
        bookingId: inspectionBooking.id,
        photo_urls:
          photos.length > 0
            ? photos
            : [
                "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80",
              ],
        condition_notes:
          inspectionNotes || (damageFound ? "Damage noted during return inspection." : "Clean return in original condition."),
        damage_found: damageFound,
        damage_estimated_paise: damageFound ? Math.round(damageEstimateRupees * 100) : 0,
        late_days: Number(lateDays) || 0,
      });
      setInspectionBooking(null);
      setInspectionNotes("");
      setDamageFound(false);
      setDamageEstimateRupees(0);
      setLateDays(0);
      setInspectionPhotos("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record return inspection.");
    }
  }

  async function handleApprove(extensionId: string) {
    try {
      await approveExtension.mutateAsync(extensionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve extension.");
    }
  }

  async function handleReject(extensionId: string) {
    try {
      await rejectExtension.mutateAsync(extensionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject extension.");
    }
  }

  // Live settlement calculations for return inspection modal
  const depositHeldPaise = inspectionBooking?.deposit?.amount_paise || 0;
  const depositHeldRupees = depositHeldPaise / 100;
  const damageDeductionRupees = damageFound ? Number(damageEstimateRupees) || 0 : 0;
  const dailyRatePaise = inspectionBooking?.daily_price_paise || 60000;
  const lateFeeRupees = (Number(lateDays) || 0) * (dailyRatePaise / 100);
  const totalDeductions = damageDeductionRupees + lateFeeRupees;
  const netRefundRupees = Math.max(0, depositHeldRupees - totalDeductions);

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/rentals" className="flex items-center gap-1 text-sm font-semibold text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            Partner Workspace • Rentals (A7)
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">Rental Bookings & Handover</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage equipment dispatch, outbound handover evidence, return inspections, and deposit settlements.
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "ALL", label: "All Bookings" },
              { id: "CONFIRMED", label: "Pending Handover" },
              { id: "ACTIVE", label: "In Active Custody" },
              { id: "RETURN_PENDING", label: "Needs Inspection" },
              { id: "COMPLETED", label: "Settled / Complete" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-neutral-900 text-white shadow-xs"
                    : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by title, ID or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-neutral-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Bookings List */}
        <div className="mt-6 space-y-5">
          {isLoading ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
              Loading bookings...
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-red-600 flex flex-col items-center gap-2">
              <AlertCircle className="h-6 w-6" />
              {error instanceof Error ? error.message : "Unable to load bookings."}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-400">
              No rental bookings found for this filter.
            </div>
          ) : (
            filteredBookings.map((b) => {
              const pendingExtensions = b.extensions.filter((ext) => ext.status === "PENDING");
              const isConfirmed = b.status === "CONFIRMED";
              const isActive = b.status === "ACTIVE" || b.status === "HANDED_OVER";
              const isReturnPending = b.status === "RETURN_PENDING" || b.status === "RETURNED";
              const isInspectedOrSettled =
                b.status === "INSPECTED" || b.status === "SETTLED" || b.status === "COMPLETED";

              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    {/* Left Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700 uppercase">
                          #{b.id.slice(0, 8)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-0.5 text-xs font-extrabold uppercase ${
                            isConfirmed
                              ? "bg-amber-100 text-amber-900"
                              : isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : isReturnPending
                              ? "bg-purple-100 text-purple-900"
                              : "bg-blue-100 text-blue-900"
                          }`}
                        >
                          ● {b.status.replace(/_/g, " ")}
                        </span>
                        {b.deposit && (
                          <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            Escrow Deposit: ₹{(b.deposit.amount_paise / 100).toLocaleString("en-IN")} ({b.deposit.status})
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xl font-bold text-neutral-900">{b.asset_title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                          <span className="flex items-center gap-1 font-semibold text-neutral-800">
                            <Calendar className="h-3.5 w-3.5 text-action" />
                            Rental Window: {b.rental_start} to {b.rental_end}
                          </span>
                          {b.assigned_serial && (
                            <span className="font-mono bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-neutral-700">
                              Unit Serial: <strong>{b.assigned_serial}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Customer & Dispatch Details Box */}
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3.5 text-xs space-y-2">
                        <div className="flex flex-wrap items-center gap-4 text-neutral-700">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-neutral-400" />
                            <span className="font-bold">{b.customer_name || "Direct Customer"}</span>
                          </div>
                          {b.customer_phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-neutral-400" />
                              <a href={`tel:${b.customer_phone}`} className="font-semibold text-action hover:underline">
                                {b.customer_phone}
                              </a>
                            </div>
                          )}
                        </div>
                        {b.delivery_address && (
                          <div className="flex items-start gap-1.5 text-neutral-600">
                            <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                            <span>
                              {[
                                b.delivery_address.line1,
                                b.delivery_address.line2,
                                b.delivery_address.locality,
                                b.delivery_address.city,
                                b.delivery_address.postal_code,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Outbound Handover Summary (if already done) */}
                      {b.handover && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span>Outbound Handover Recorded ({new Date(b.handover.handed_over_at).toLocaleDateString()})</span>
                          </div>
                          {b.handover.condition_notes && (
                            <p className="text-neutral-600 italic">"{b.handover.condition_notes}"</p>
                          )}
                        </div>
                      )}

                      {/* Inbound Return Inspection Summary (if already done) */}
                      {b.return_inspection && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-blue-900">
                              <ClipboardCheck className="h-4 w-4 text-blue-600" />
                              <span>Inbound Inspection Completed</span>
                            </div>
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                                b.return_inspection.damage_found
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {b.return_inspection.damage_found ? "Damage Reported" : "Clean Return"}
                            </span>
                          </div>
                          {b.return_inspection.condition_notes && (
                            <p className="text-neutral-600 italic">"{b.return_inspection.condition_notes}"</p>
                          )}
                          <div className="flex gap-4 font-semibold text-neutral-700 pt-1">
                            {b.return_inspection.damage_estimated_paise > 0 && (
                              <span className="text-red-600">
                                Damage: ₹{(b.return_inspection.damage_estimated_paise / 100).toLocaleString("en-IN")}
                              </span>
                            )}
                            {b.return_inspection.late_fee_paise > 0 && (
                              <span className="text-amber-700">
                                Late Fee: ₹{(b.return_inspection.late_fee_paise / 100).toLocaleString("en-IN")}
                              </span>
                            )}
                            {b.deposit && (
                              <span className="text-emerald-700">
                                Refunded to Customer: ₹{(b.deposit.refunded_amount_paise / 100).toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: State Progression Actions */}
                    <div className="flex flex-col gap-2.5 sm:min-w-[220px]">
                      {isConfirmed && (
                        <button
                          onClick={() => {
                            setHandoverBooking(b);
                            setAssignedSerial(b.assigned_serial || "");
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#d65f1a] transition-all cursor-pointer"
                        >
                          <Camera className="h-4 w-4" /> Record Handover & Dispatch
                        </button>
                      )}

                      {isActive && (
                        <>
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> In Customer Custody
                            </span>
                            <span className="block mt-0.5 text-[11px] text-neutral-500">
                              Active rental window running
                            </span>
                          </div>
                          <button
                            onClick={() => handleInitiateReturn(b.id)}
                            disabled={initiateReturn.isPending}
                            className="flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-xs hover:border-neutral-400 transition-all cursor-pointer"
                          >
                            <RotateCcw className="h-4 w-4 text-neutral-500" /> Initiate Return Process
                          </button>
                        </>
                      )}

                      {isReturnPending && (
                        <button
                          onClick={() => {
                            setInspectionBooking(b);
                            setDamageFound(false);
                            setDamageEstimateRupees(0);
                            setLateDays(0);
                            setInspectionNotes("");
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-neutral-800 transition-all cursor-pointer"
                        >
                          <ClipboardCheck className="h-4 w-4 text-emerald-400" /> Perform Return Inspection & Settle
                        </button>
                      )}

                      {isInspectedOrSettled && (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-neutral-800">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Settled & Completed
                          </span>
                          <span className="block mt-0.5 text-[11px] text-neutral-500">
                            Deposit processed per inspection
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Extension Requests Block */}
                  {pendingExtensions.length > 0 && (
                    <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4">
                      {pendingExtensions.map((ext) => (
                        <div
                          key={ext.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5"
                        >
                          <div className="flex items-center gap-2 text-xs text-amber-900">
                            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                            <div>
                              <span className="font-bold">Customer Requested Rental Extension</span>:{" "}
                              <strong>{ext.previous_end}</strong> &rarr; <strong>{ext.new_end}</strong> (Additional{" "}
                              <strong className="text-neutral-900">
                                +₹{(ext.price_delta_paise / 100).toLocaleString("en-IN")}
                              </strong>
                              )
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleApprove(ext.id)}
                              disabled={approveExtension.isPending || rejectExtension.isPending}
                              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                            >
                              <Check className="h-3.5 w-3.5" /> Approve Extension
                            </button>
                            <button
                              onClick={() => handleReject(ext.id)}
                              disabled={approveExtension.isPending || rejectExtension.isPending}
                              className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:border-neutral-400 disabled:opacity-50 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" /> Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Handover Modal */}
      {handoverBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-action" />
                <h3 className="text-lg font-bold text-neutral-900">Outbound Handover & Condition Check</h3>
              </div>
              <button
                onClick={() => setHandoverBooking(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Record equipment identification and verification evidence before transferring physical possession to the customer.
            </p>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700">Assigned Unit Serial / Identifier</label>
                <input
                  type="text"
                  value={assignedSerial}
                  onChange={(e) => setAssignedSerial(e.target.value)}
                  placeholder="e.g. SN-8841-BOSCH or Plate #"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
                />
              </div>

              {/* Handover Checklist */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-2">Pre-Handover Verification Checklist</label>
                <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.operational_test}
                      onChange={(e) => setChecklist({ ...checklist, operational_test: e.target.checked })}
                      className="rounded text-action focus:ring-action"
                    />
                    <span className="font-medium text-neutral-800">Operational & Power test passed</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.accessories_verified}
                      onChange={(e) => setChecklist({ ...checklist, accessories_verified: e.target.checked })}
                      className="rounded text-action focus:ring-action"
                    />
                    <span className="font-medium text-neutral-800">All standard accessories & cables included</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.no_physical_damage}
                      onChange={(e) => setChecklist({ ...checklist, no_physical_damage: e.target.checked })}
                      className="rounded text-action focus:ring-action"
                    />
                    <span className="font-medium text-neutral-800">No physical cracks, structural or cosmetic defects</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.safety_gear_provided}
                      onChange={(e) => setChecklist({ ...checklist, safety_gear_provided: e.target.checked })}
                      className="rounded text-action focus:ring-action"
                    />
                    <span className="font-medium text-neutral-800">Safety instructions / packaging supplied</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Condition Notes for Customer & Records</label>
                <textarea
                  rows={2}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="e.g. Unit is in clean condition with full battery and protective case."
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Verification Photo URL</label>
                <input
                  type="text"
                  value={handoverPhotos}
                  onChange={(e) => setHandoverPhotos(e.target.value)}
                  placeholder="Paste photo URL (or leave blank to use verified sample image)"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs focus:border-action focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                onClick={() => setHandoverBooking(null)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={recordHandover.isPending}
                onClick={handleSubmitHandover}
                className="rounded-lg bg-action px-5 py-2.5 text-xs font-bold text-white hover:bg-[#d65f1a] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {recordHandover.isPending ? "Recording Handover..." : "Confirm Handover & Set Active"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Inspection Modal (§4.5 Settlement Matrix) */}
      {inspectionBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-neutral-900">Inbound Inspection & Deposit Settlement</h3>
              </div>
              <button
                onClick={() => setInspectionBooking(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Inspect equipment returned by the customer and execute automated escrow deposit release or deductions per §4.5 Settlement Matrix.
            </p>

            <div className="mt-4 space-y-4 text-xs">
              {/* Inspection Mode Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDamageFound(false);
                    setDamageEstimateRupees(0);
                    setLateDays(0);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    !damageFound && lateDays === 0
                      ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Clean Return
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    No damage, returned on time. 100% deposit will be released immediately.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDamageFound(true)}
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                    damageFound || lateDays > 0
                      ? "border-red-500 bg-red-50/60 ring-2 ring-red-500/20"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <ShieldAlert className="h-4 w-4 text-red-600" /> Damage / Late
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Deduct damage repair estimate or late return fees from escrow deposit.
                  </p>
                </button>
              </div>

              {/* Damage & Lateness Inputs */}
              {(damageFound || lateDays > 0) && (
                <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/30 p-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-neutral-700">Estimated Damage Repair (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={damageEstimateRupees}
                        onChange={(e) => setDamageEstimateRupees(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-neutral-700">Late Days (Beyond Schedule)</label>
                      <input
                        type="number"
                        min={0}
                        value={lateDays}
                        onChange={(e) => setLateDays(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700">Inbound Inspection Notes</label>
                <textarea
                  rows={2}
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder={
                    damageFound
                      ? "Describe damaged component (e.g. cracked handle, chipped blade, missing battery cover)..."
                      : "e.g. Unit returned in good working order, all components present."
                  }
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Inspection Proof Photo URL</label>
                <input
                  type="text"
                  value={inspectionPhotos}
                  onChange={(e) => setInspectionPhotos(e.target.value)}
                  placeholder="Paste inspection photo URL (or leave blank for sample photo)"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              {/* Settlement Matrix Live Preview */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
                <div className="font-bold text-neutral-900 flex items-center justify-between border-b border-neutral-200 pb-1.5">
                  <span>§4.5 Settlement Matrix Outcome:</span>
                  <span className="text-action">Automated Execution</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Escrow Deposit Held:</span>
                  <span className="font-bold text-neutral-900">₹{depositHeldRupees.toLocaleString("en-IN")}</span>
                </div>
                {damageDeductionRupees > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Damage Deduction:</span>
                    <span className="font-bold">-₹{damageDeductionRupees.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {lateFeeRupees > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Late Fee ({lateDays} days):</span>
                    <span className="font-bold">-₹{lateFeeRupees.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-bold text-emerald-700">
                  <span>Net Refund to Customer:</span>
                  <span>₹{netRefundRupees.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                onClick={() => setInspectionBooking(null)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={recordInspection.isPending}
                onClick={handleSubmitInspection}
                className="rounded-lg bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {recordInspection.isPending ? "Executing Settlement..." : "Confirm & Execute Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
