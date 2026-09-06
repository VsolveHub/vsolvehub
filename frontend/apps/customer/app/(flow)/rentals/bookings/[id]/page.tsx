"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ShieldCheck,
  Truck,
  Store,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
  FileText,
  Camera,
  Layers,
  HelpCircle,
  Check,
  X,
  ExternalLink,
  MapPin,
  Sparkles,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { apiFetch } from "@vsolve/api-client";

interface BookingDetail {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: {
    line1?: string;
    line2?: string;
    locality?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  } | null;
  asset_id: string;
  asset_title: string;
  daily_price_paise?: number;
  deposit_paise?: number;
  vendor_name: string;
  assigned_serial: string;
  rental_start: string;
  rental_end: string;
  delivery_mode: string;
  status: string;
  lines: Array<{
    id: string;
    line_type: string;
    amount_paise: number;
    description: string;
  }>;
  deposit?: {
    id: string;
    amount_paise: number;
    status: string;
    refunded_amount_paise: number;
    consumed_amount_paise: number;
  };
  handover?: {
    assigned_serial: string;
    condition_notes: string;
    photo_urls: string[];
    checklist?: Record<string, boolean>;
    handed_over_at: string;
  };
  return_inspection?: {
    condition_notes: string;
    photo_urls: string[];
    damage_found: boolean;
    damage_estimated_paise: number;
    damage_details?: Record<string, unknown>;
    late_days: number;
    late_fee_paise: number;
    returned_at: string;
  };
  extensions: Array<{
    id: string;
    previous_end: string;
    new_end: string;
    price_delta_paise: number;
    deposit_delta_paise: number;
    status: string;
    created_at: string;
    approved_at?: string | null;
  }>;
}

export default function RentalBookingTrackingPage() {
  const params = useParams();
  const bookingId = params?.id as string;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Photo viewer modal
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Extension Modal
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [newEndDate, setNewEndDate] = useState("");
  const [extending, setExtending] = useState(false);

  // Dispute Modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputing, setDisputing] = useState(false);

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function loadBooking() {
    setLoading(true);
    try {
      const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/`);
      if (!res.ok) {
        throw new Error("Failed to load rental booking details");
      }
      const data = await res.json();
      setBooking(data);
    } catch (err: any) {
      setError(err.message || "Failed to load rental details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bookingId) {
      loadBooking();
    }
  }, [bookingId]);

  async function handleRequestExtension() {
    if (!newEndDate) return;
    setExtending(true);
    try {
      const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/extend/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_end_date: newEndDate }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errMsg = d?.error?.message || d?.error || "Extension request refused.";
        throw new Error(errMsg);
      }
      setShowExtensionModal(false);
      setNewEndDate("");
      await loadBooking();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExtending(false);
    }
  }

  async function handleDisputeDeposit() {
    if (!disputeReason) return;
    setDisputing(true);
    try {
      const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/dispute/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: disputeReason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errMsg = d?.error?.message || d?.error || "Failed to submit dispute.";
        throw new Error(errMsg);
      }
      setShowDisputeModal(false);
      setDisputeReason("");
      await loadBooking();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDisputing(false);
    }
  }

  async function handleCancelBooking() {
    setCancelling(true);
    try {
      const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errMsg = d?.error?.message || d?.error || "Failed to cancel booking.";
        throw new Error(errMsg);
      }
      setShowCancelModal(false);
      await loadBooking();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  }

  async function handlePayExtension(extensionId: string) {
    try {
      const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/extensions/${extensionId}/pay/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errMsg = d?.error?.message || d?.error || "Failed to pay for extension.";
        throw new Error(errMsg);
      }
      await loadBooking();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-action border-t-transparent" />
          <p className="text-sm font-medium text-neutral-500">Loading rental tracking record...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <p className="text-red-600 font-bold">{error || "Booking not found"}</p>
        <Link href="/catalog" className="mt-4 inline-block text-action underline text-sm">
          Return to Catalog
        </Link>
      </div>
    );
  }

  // Extension calculation preview
  const currentEnd = new Date(booking.rental_end);
  const targetEnd = newEndDate ? new Date(newEndDate) : null;
  const extraDays =
    targetEnd && targetEnd > currentEnd
      ? Math.round((targetEnd.getTime() - currentEnd.getTime()) / (1000 * 3600 * 24))
      : 0;
  const dailyRatePaise = booking.daily_price_paise || 60000;
  const extensionCostRupees = (extraDays * dailyRatePaise) / 100;

  // Timeline progress calculation
  const steps = [
    { label: "Confirmed", status: "CONFIRMED" },
    { label: "Handover / Active", status: "ACTIVE" },
    { label: "Return Initiated", status: "RETURN_PENDING" },
    { label: "Inspected & Settled", status: "SETTLED" },
  ];

  const currentStatus = booking.status;
  const getStepIndex = (status: string) => {
    if (status === "CONFIRMED") return 0;
    if (status === "HANDED_OVER" || status === "ACTIVE") return 1;
    if (status === "RETURN_PENDING" || status === "RETURNED") return 2;
    if (status === "INSPECTED" || status === "SETTLED" || status === "COMPLETED") return 3;
    return 0;
  };
  const activeStepIdx = getStepIndex(currentStatus);

  return (
    <div className="min-h-screen bg-neutral-50 pb-24 pt-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/bookings" className="hover:text-neutral-900">
            All Bookings
          </Link>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
          <Link href="/bookings?category=rentals" className="hover:text-neutral-900">
            Rentals
          </Link>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
          <span className="font-medium text-neutral-900">Booking #{booking.id.slice(0, 8)}</span>
        </nav>

        {/* Top Header Card */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700 uppercase">
                  Rental #{booking.id.slice(0, 8)}
                </span>
                <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  Vendor: {booking.vendor_name}
                </span>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-neutral-900">
                {booking.asset_title}
              </h1>
              {booking.assigned_serial && (
                <p className="mt-1 text-xs text-neutral-500 font-mono">
                  Assigned Unit Serial: <strong className="text-neutral-900">{booking.assigned_serial}</strong>
                </p>
              )}
            </div>

            <div className="sm:text-right">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold uppercase tracking-wide ${
                  currentStatus === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-800"
                    : currentStatus === "COMPLETED" || currentStatus === "SETTLED"
                    ? "bg-blue-100 text-blue-800"
                    : currentStatus === "DISPUTED"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                ● {currentStatus.replace(/_/g, " ")}
              </span>
              <p className="mt-1 text-xs text-neutral-500">
                Window: <strong>{booking.rental_start}</strong> to <strong>{booking.rental_end}</strong>
              </p>
            </div>
          </div>

          {/* Timeline Bar */}
          <div className="mt-8 border-t border-neutral-100 pt-6">
            <div className="grid grid-cols-4 gap-2">
              {steps.map((s, idx) => {
                const isPassed = idx <= activeStepIdx;
                const isCurrent = idx === activeStepIdx;
                return (
                  <div key={s.label} className="flex flex-col gap-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isPassed ? "bg-action" : "bg-neutral-200"
                      }`}
                    />
                    <span
                      className={`text-[11px] sm:text-xs font-bold ${
                        isCurrent
                          ? "text-action"
                          : isPassed
                          ? "text-neutral-800"
                          : "text-neutral-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Dispatch Address Banner */}
          {booking.delivery_address && (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-neutral-50 p-3.5 text-xs text-neutral-600">
              <Truck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-neutral-900">Direct Vendor Dispatch Address: </span>
                <span>
                  {[
                    booking.delivery_address.line1,
                    booking.delivery_address.line2,
                    booking.delivery_address.locality,
                    booking.delivery_address.city,
                    booking.delivery_address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            </div>
          )}

          {/* Quick Actions Bar */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-5">
            {booking.status === "ACTIVE" && (
              <button
                onClick={() => setShowExtensionModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-action px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#d65f1a] transition-all cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5" /> Request Rental Extension
              </button>
            )}

            {(booking.status === "CONFIRMED" || booking.status === "HELD" || booking.status === "PAYMENT_PENDING") && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 shadow-2xs hover:bg-red-100 transition-all cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Cancel Rental Booking
              </button>
            )}

            {(booking.status === "INSPECTED" || booking.status === "SETTLED" || booking.status === "COMPLETED") &&
              booking.deposit &&
              booking.deposit.consumed_amount_paise > 0 &&
              booking.deposit.status !== "DISPUTED" && (
                <button
                  onClick={() => setShowDisputeModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 shadow-sm hover:bg-red-100 transition-all cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Contest Deduction / Raise Dispute
                </button>
              )}
          </div>
        </div>

        {/* Pending Extension Notice with Payment Action */}
        {booking.extensions && booking.extensions.some((ext) => ext.status === "PENDING") && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-amber-900">
                <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">Extension Request Pending</h3>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Extend rental until{" "}
                    <strong>{booking.extensions.find((ext) => ext.status === "PENDING")?.new_end}</strong> (Price delta:{" "}
                    <strong>
                      ₹{((booking.extensions.find((ext) => ext.status === "PENDING")?.price_delta_paise || 0) / 100).toLocaleString("en-IN")}
                    </strong>
                    ).
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const pExt = booking.extensions.find((ext) => ext.status === "PENDING");
                  if (pExt) handlePayExtension(pExt.id);
                }}
                className="rounded-xl bg-action px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#d65f1a] transition-colors shrink-0 cursor-pointer"
              >
                Pay Extension Fee & Confirm
              </button>
            </div>
          </div>
        )}

        {/* Cancelled Status Banner */}
        {booking.status === "CANCELLED" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3 text-red-900">
              <RotateCcw className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">Rental Booking Cancelled</h3>
                <p className="mt-1 text-xs text-red-700 leading-relaxed">
                  This rental was cancelled before equipment handover. Any eligible refunds and deposit hold releases have been processed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dispute Status Banner */}
        {booking.status === "DISPUTED" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3 text-red-900">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">Deposit Dispute Under Operations Adjudication</h3>
                <p className="mt-1 text-xs text-red-700 leading-relaxed">
                  Your dispute statement and the partner's inbound inspection photos have been queued for adjudication by
                  VSolve Operations. Deposit funds are frozen in escrow until resolution.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two-Column Grid: Escrow Deposit & Outbound Handover Evidence */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Security Deposit Escrow Card */}
          {booking.deposit && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-action" /> Security Deposit Escrow
                </h2>
                <span className="rounded-md bg-neutral-100 px-2.5 py-0.5 text-xs font-bold uppercase text-neutral-700">
                  {booking.deposit.status}
                </span>
              </div>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex justify-between text-neutral-600">
                  <span>Total Deposit Escrow Held:</span>
                  <span className="font-bold text-neutral-900">
                    ₹{(booking.deposit.amount_paise / 100).toLocaleString("en-IN")}
                  </span>
                </div>
                {booking.deposit.consumed_amount_paise > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Deductions (Damage / Late fee):</span>
                    <span className="font-bold">
                      -₹{(booking.deposit.consumed_amount_paise / 100).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                {booking.deposit.refunded_amount_paise > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Refunded to Original Payment Method:</span>
                    <span>₹{(booking.deposit.refunded_amount_paise / 100).toLocaleString("en-IN")}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-neutral-50 p-3.5 text-xs text-neutral-600">
                {booking.deposit.status === "RELEASED"
                  ? "✓ 100% of your deposit has been refunded to your original payment method."
                  : booking.deposit.status === "HELD"
                  ? "Your deposit is held safely in escrow during active equipment possession."
                  : booking.deposit.status === "DISPUTED"
                  ? "Deposit funds are securely frozen pending operations case decision."
                  : "Deposit settlement executes immediately upon inbound equipment return inspection."}
              </div>
            </div>
          )}

          {/* Outbound Handover Evidence Card (§4.6) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <Camera className="h-5 w-5 text-action" /> Outbound Handover Evidence
            </h2>
            {booking.handover ? (
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between text-neutral-500">
                  <span>Transferred At:</span>
                  <strong className="text-neutral-800">
                    {new Date(booking.handover.handed_over_at).toLocaleString()}
                  </strong>
                </div>

                {/* Checklist Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {booking.handover.checklist ? (
                    Object.entries(booking.handover.checklist).map(([key, val]) => (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          val ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        <Check className="h-3 w-3" /> {key.replace(/_/g, " ")}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <Check className="h-3 w-3" /> Operational Condition Verified
                    </span>
                  )}
                </div>

                {booking.handover.condition_notes && (
                  <p className="text-neutral-700 italic bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                    "{booking.handover.condition_notes}"
                  </p>
                )}

                {/* Handover Photos Gallery */}
                {booking.handover.photo_urls && booking.handover.photo_urls.length > 0 && (
                  <div className="pt-2">
                    <span className="block font-semibold text-neutral-700 mb-2">Handover Verification Photos:</span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {booking.handover.photo_urls.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActivePhoto(url)}
                          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-200 transition-transform hover:scale-105 cursor-pointer"
                        >
                          <img src={url} alt={`Handover evidence ${i + 1}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400">
                <Truck className="mx-auto h-8 w-8 text-neutral-300 mb-2" />
                Custody transfer pending. Partner will record condition photos upon delivery.
              </div>
            )}
          </div>
        </div>

        {/* Inbound Return Inspection & Settlement Matrix Card (§4.5 & §4.6) */}
        {booking.return_inspection && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-6 w-6 text-emerald-600" />
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Inbound Return Inspection & Settlement</h2>
                  <p className="text-xs text-neutral-500">
                    Executed on {new Date(booking.return_inspection.returned_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
                  booking.return_inspection.damage_found
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {booking.return_inspection.damage_found ? "Damage Reported" : "Clean Return Verified"}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-xl bg-neutral-50 p-4">
                <span className="text-neutral-400 font-semibold uppercase text-[10px]">Condition Finding</span>
                <p className="mt-1 text-sm font-bold text-neutral-800">
                  {booking.return_inspection.damage_found ? "Damage Found" : "Clean Condition (No Damage)"}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <span className="text-neutral-400 font-semibold uppercase text-[10px]">Damage Deduction</span>
                <p className="mt-1 text-sm font-bold text-neutral-800">
                  ₹{(booking.return_inspection.damage_estimated_paise / 100).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <span className="text-neutral-400 font-semibold uppercase text-[10px]">Late Fee Deduction</span>
                <p className="mt-1 text-sm font-bold text-neutral-800">
                  ₹{(booking.return_inspection.late_fee_paise / 100).toLocaleString("en-IN")}{" "}
                  {booking.return_inspection.late_days > 0 && `(${booking.return_inspection.late_days} Days)`}
                </p>
              </div>
            </div>

            {booking.return_inspection.condition_notes && (
              <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50/70 p-4 text-xs">
                <span className="font-bold text-neutral-700">Vendor Inspection Notes: </span>
                <span className="italic text-neutral-600">"{booking.return_inspection.condition_notes}"</span>
              </div>
            )}

            {/* Return Photos */}
            {booking.return_inspection.photo_urls && booking.return_inspection.photo_urls.length > 0 && (
              <div className="mt-4">
                <span className="block text-xs font-semibold text-neutral-700 mb-2">Inbound Inspection Photos:</span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {booking.return_inspection.photo_urls.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActivePhoto(url)}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-200 transition-transform hover:scale-105 cursor-pointer"
                    >
                      <img src={url} alt={`Return evidence ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Itemized Price Statement */}
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-neutral-900 mb-4">Itemized Rental Financial Statement</h2>
          <div className="divide-y divide-neutral-100 text-xs">
            {booking.lines.map((line) => (
              <div key={line.id} className="flex justify-between py-2 text-neutral-700">
                <span className="font-medium">{line.description || line.line_type}</span>
                <span className="font-bold text-neutral-900">
                  ₹{(line.amount_paise / 100).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Photo Zoom Modal */}
      {activePhoto && (
        <div
          onClick={() => setActivePhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="relative max-w-2xl overflow-hidden rounded-2xl bg-black">
            <button
              onClick={() => setActivePhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <img src={activePhoto} alt="Zoomed evidence" className="max-h-[80vh] w-auto object-contain" />
          </div>
        </div>
      )}

      {/* Extension Modal (§4.6) */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-action" />
                <h3 className="text-lg font-bold text-neutral-900">Extend Rental Window</h3>
              </div>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Need the gear longer? Select your new return date. Current return: <strong>{booking.rental_end}</strong>.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700">New Return Date</label>
                <input
                  type="date"
                  min={booking.rental_end}
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
                />
              </div>

              {extraDays > 0 && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-neutral-600">
                    <span>Additional Duration:</span>
                    <strong className="text-neutral-900">{extraDays} Extra Days</strong>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>Daily Rate:</span>
                    <span>₹{(dailyRatePaise / 100).toLocaleString("en-IN")} / day</span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-200 pt-1 font-bold text-action">
                    <span>Additional Charge:</span>
                    <span>₹{extensionCostRupees.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                onClick={() => setShowExtensionModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={extending || !newEndDate || extraDays <= 0}
                onClick={handleRequestExtension}
                className="rounded-lg bg-action px-5 py-2.5 text-xs font-bold text-white hover:bg-[#d65f1a] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {extending ? "Submitting..." : "Submit Extension Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal (§4.5) */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                <h3 className="text-lg font-bold text-neutral-900">Contest Deduction / Raise Dispute</h3>
              </div>
              <button
                onClick={() => setShowDisputeModal(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Contest damage or late fees charged against your deposit. VSolve Operations will review outbound vs inbound photos and evidence.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-neutral-700">Reason for Dispute</label>
              <textarea
                rows={4}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Explain why the deduction is contested (e.g., pre-existing cosmetic scratch present at handover, returned on time per agreement)..."
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={disputing || !disputeReason.trim()}
                onClick={handleDisputeDeposit}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {disputing ? "Submitting Dispute..." : "Submit Dispute to Operations"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-red-600" />
                <h3 className="text-base font-bold text-neutral-900">Cancel Rental Booking</h3>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-bold">Cancellation Policy terms:</p>
              <p>• If cancelled ≥ 24h before start date: 100% rental refund + 100% deposit release.</p>
              <p>• If cancelled &lt; 24h before start date: 1 day&apos;s rental fee is retained; balance refunded + 100% deposit released.</p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-neutral-700">Reason for Cancellation (Optional)</label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Event postponed, plans changed"
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-800 focus:border-action focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 cursor-pointer"
              >
                Keep Booking
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelBooking}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
