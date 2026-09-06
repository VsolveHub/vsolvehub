"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  DoorOpen,
  Download,
  HelpCircle,
  Lock,
  LogOut,
  MapPin,
  Phone,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

import {
  fetchStayReservation,
  cancelStayReservation,
  requestStayExtension,
  confirmStayExtension,
  earlyCheckoutStay,
  disputeStayDamage,
  type StayReservationDetail,
} from "@/features/stays/queries";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

export default function StayReservationDetailPage() {
  const params = useParams();
  const reservationId = params?.reservationId as string;

  const [reservation, setReservation] = useState<StayReservationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>("Change of plans");
  const [cancelling, setCancelling] = useState<boolean>(false);

  const [showExtendModal, setShowExtendModal] = useState<boolean>(false);
  const [extensionNights, setExtensionNights] = useState<number>(3);
  const [extensionMonths, setExtensionMonths] = useState<number>(0);
  const [extensionQuote, setExtensionQuote] = useState<{
    extension_id: string;
    extended_end_date: string;
    additional_amount_paise: number;
    additional_deposit_paise?: number;
  } | null>(null);
  const [quoting, setQuoting] = useState<boolean>(false);
  const [confirmingExtension, setConfirmingExtension] = useState<boolean>(false);

  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState<boolean>(false);
  const [earlyCheckoutDate, setEarlyCheckoutDate] = useState<string>("");
  const [earlyCheckoutReason, setEarlyCheckoutReason] = useState<string>("Schedule change");
  const [earlyCheckingOut, setEarlyCheckingOut] = useState<boolean>(false);

  const [showDisputeModal, setShowDisputeModal] = useState<boolean>(false);
  const [disputeReason, setDisputeReason] = useState<string>("");
  const [disputing, setDisputing] = useState<boolean>(false);

  useEffect(() => {
    if (!reservationId) return;
    setLoading(true);
    fetchStayReservation(reservationId)
      .then((data) => {
        setReservation(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load reservation.");
        setLoading(false);
      });
  }, [reservationId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const copyId = () => {
    if (!reservation) return;
    navigator.clipboard.writeText(reservation.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reloadData = async () => {
    if (!reservationId) return;
    try {
      const data = await fetchStayReservation(reservationId);
      setReservation(data);
    } catch {
      // quiet fallback
    }
  };

  // 1. Cancel Handler
  const handleCancelReservation = async () => {
    if (!reservation) return;
    setCancelling(true);
    try {
      const updated = await cancelStayReservation(reservation.id, cancelReason);
      setReservation(updated);
      setShowCancelModal(false);
      showToast("Reservation successfully cancelled. Refunds initiated per policy.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel reservation.");
    } finally {
      setCancelling(false);
    }
  };

  // 2. Extension Quote Handler
  const handleQuoteExtension = async () => {
    if (!reservation) return;
    setQuoting(true);
    try {
      const quote = await requestStayExtension(reservation.id, extensionNights, extensionMonths);
      setExtensionQuote(quote);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No availability for requested extension period.");
    } finally {
      setQuoting(false);
    }
  };

  // 2b. Confirm Extension Handler
  const handleConfirmExtension = async () => {
    if (!extensionQuote) return;
    setConfirmingExtension(true);
    try {
      const updated = await confirmStayExtension(extensionQuote.extension_id);
      setReservation(updated);
      setShowExtendModal(false);
      setExtensionQuote(null);
      showToast("Stay extension confirmed! Your check-out date is updated.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to confirm extension.");
    } finally {
      setConfirmingExtension(false);
    }
  };

  // 3. Early Checkout Handler
  const handleEarlyCheckout = async () => {
    if (!reservation) return;
    setEarlyCheckingOut(true);
    try {
      const dateToUse = earlyCheckoutDate || new Date().toISOString().split("T")[0];
      const updated = await earlyCheckoutStay(reservation.id, dateToUse, earlyCheckoutReason);
      setReservation(updated);
      setShowEarlyCheckoutModal(false);
      showToast("Early check-out recorded. Host notified for inspection.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record early checkout.");
    } finally {
      setEarlyCheckingOut(false);
    }
  };

  // 4. Dispute Damage Handler
  const handleDisputeDamage = async () => {
    if (!reservation || !disputeReason.trim()) return;
    setDisputing(true);
    try {
      const updated = await disputeStayDamage(reservation.id, disputeReason);
      setReservation(updated);
      setShowDisputeModal(false);
      showToast("Dispute opened. Operations team will review and resolve within 48h.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to dispute damage.");
    } finally {
      setDisputing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] py-20 text-center">
        <Clock className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
        <p className="mt-3 text-sm font-semibold text-neutral-500">Loading reservation details…</p>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] px-4 py-20 text-center">
        <div className="mx-auto max-w-md rounded-2xl bg-red-50 p-6 border border-red-200">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <h2 className="text-base font-bold text-red-800">Reservation Not Found</h2>
          <p className="mt-1 text-xs text-red-600">{error || "Could not retrieve booking details."}</p>
          <Link
            href="/bookings?category=stays"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-signal-700 hover:text-action"
          >
            ← View My Bookings
          </Link>
        </div>
      </div>
    );
  }

  const isConfirmed = reservation.status === "CONFIRMED";
  const isInStay = reservation.status === "IN_STAY" || reservation.status === "CHECKED_IN";
  const isCancelled = reservation.status === "CANCELLED";
  const isCompleted = reservation.status === "COMPLETED" || reservation.status === "SETTLED";
  const isEarlyCheckout = reservation.status === "EARLY_CHECKOUT";
  const cancellationPolicy = reservation.policy_snapshot?.cancellation_policy || "MODERATE";

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 text-navy-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-xl bg-navy-900 px-5 py-3 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Top Bar */}
      <div className="border-b border-line bg-white px-4 py-3 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <Link
            href="/bookings?category=stays"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900"
          >
            <ChevronLeft className="h-4 w-4" /> All My Bookings
          </Link>
          <div className="text-xs font-bold text-neutral-500 flex items-center gap-2">
            <span>Pass #{reservation.id.slice(0, 8)}</span>
            <button
              onClick={copyId}
              className="rounded p-1 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
              title="Copy reservation ID"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied && <span className="text-[10px] text-emerald-600">Copied!</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-6">
        {/* Banner by Status */}
        {isCancelled ? (
          <div className="overflow-hidden rounded-3xl bg-neutral-900 p-6 sm:p-8 text-white shadow-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-red-300">
              <XCircle className="h-4 w-4 text-red-400" /> Reservation Cancelled
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
              This reservation has been cancelled
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-300 max-w-xl">
              Applicable refunds have been calculated per property cancellation policy ({cancellationPolicy}) and processed to your source account.
            </p>
          </div>
        ) : isEarlyCheckout ? (
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-amber-700 to-orange-800 p-6 sm:p-8 text-white shadow-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-100">
              <LogOut className="h-4 w-4 text-amber-300" /> Early Check-Out Recorded
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
              Departure completed early
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-amber-100 max-w-xl">
              Your unit calendar has been released. The host is completing move-out inspection for deposit settlement.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-6 sm:p-8 text-white shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-100">
                  <Check className="h-4 w-4 text-emerald-300" /> Booking Confirmed & Unit Reserved
                </div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
                  You’re all set for move-in!
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-emerald-100 max-w-xl">
                  Your unit has been reserved exclusively for your dates. Present this digital pass to the property host upon arrival.
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-4 text-center shrink-0">
                <div className="text-[10px] uppercase font-bold text-emerald-200">Allocated Unit</div>
                <div className="mt-1 text-2xl font-black text-white">{reservation.unit_code || "Unit Assigned"}</div>
                <div className="text-xs text-emerald-100 mt-0.5">{reservation.unit_name}</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        {!isCancelled && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {reservation.receipt_url && (
              <a
                href={`${PUBLIC_API_BASE_URL}${reservation.receipt_url}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-xs font-bold text-navy-900 shadow-2xs hover:bg-warm-50"
              >
                <Download className="h-3.5 w-3.5" /> Download receipt
              </a>
            )}
            {isConfirmed && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50/50 hover:bg-red-100/80 px-4 py-2 text-xs font-bold text-red-700 transition-colors shadow-2xs"
              >
                <XCircle className="h-3.5 w-3.5 text-red-500" /> Cancel Reservation
              </button>
            )}

            {(isConfirmed || isInStay) && (
              <button
                onClick={() => setShowExtendModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white hover:bg-warm-50 px-4 py-2 text-xs font-bold text-navy-900 transition-colors shadow-2xs"
              >
                <CalendarPlus className="h-3.5 w-3.5 text-action" /> Extend Stay
              </button>
            )}

            {isInStay && (
              <button
                onClick={() => setShowEarlyCheckoutModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white hover:bg-warm-50 px-4 py-2 text-xs font-bold text-neutral-700 transition-colors shadow-2xs"
              >
                <LogOut className="h-3.5 w-3.5 text-neutral-500" /> Early Check-Out
              </button>
            )}

            {reservation.deposit?.status === "DISPUTED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 border border-purple-200 px-3.5 py-1.5 text-xs font-bold text-purple-800">
                <ShieldAlert className="h-3.5 w-3.5 text-purple-600" /> Dispute Under Ops Review
              </span>
            ) : (
              (isCompleted || isInStay || isEarlyCheckout) && (
                <button
                  onClick={() => setShowDisputeModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white hover:bg-warm-50 px-4 py-2 text-xs font-bold text-neutral-700 transition-colors shadow-2xs"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Dispute Deposit Deductions
                </button>
              )
            )}
          </div>
        )}

        {/* Step 14: Stay Lifecycle Timeline */}
        <div className="mt-6 rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
          <h2 className="text-sm font-extrabold text-neutral-900 uppercase tracking-wider">
            Stay Timeline & Verification
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
            <div className={`rounded-xl border p-3.5 ${isCancelled ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
              <div className="flex items-center gap-2 text-xs font-bold">
                {isCancelled ? <XCircle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {isCancelled ? "Cancelled" : "1. Confirmed"}
              </div>
              <p className="mt-1 text-[11px] text-neutral-600">
                {isCancelled ? "Hold released & refunded" : "Payment captured & unit reserved"}
              </p>
            </div>

            <div
              className={`rounded-xl border p-3.5 ${
                reservation.status === "CHECKED_IN" || reservation.status === "IN_STAY"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-warm-50 border-line text-text-secondary"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <DoorOpen className="h-4 w-4 text-action" /> 2. ID Check-In
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                {reservation.status === "CHECKED_IN" || reservation.status === "IN_STAY"
                  ? "Identity verified & keys received"
                  : "Show Govt ID to Host at check-in"}
              </p>
            </div>

            <div
              className={`rounded-xl border p-3.5 ${
                reservation.status === "IN_STAY"
                  ? "bg-signal-50 border-signal-200 text-signal-700 font-bold"
                  : "bg-warm-50 border-line text-text-secondary"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <Users className="h-4 w-4 text-action" /> 3. In Stay
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                {reservation.start_date} to {reservation.end_date}
              </p>
            </div>

            <div
              className={`rounded-xl border p-3.5 ${
                isCompleted
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-neutral-50 border-neutral-200 text-neutral-600"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <ShieldCheck className="h-4 w-4 text-amber-600" /> 4. Deposit Return
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                {reservation.deposit?.status === "REFUNDED"
                  ? "Deposit returned safely"
                  : "Inspection & return at checkout"}
              </p>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Overview Card */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-start gap-4">
                {reservation.image_url ? (
                  <img
                    src={reservation.image_url}
                    alt={reservation.property_title}
                    className="h-20 w-24 rounded-xl object-cover border border-neutral-100 shrink-0"
                  />
                ) : (
                  <div className="flex h-20 w-24 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 shrink-0">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <span className="rounded bg-navy-50 border border-navy-200 px-2 py-0.5 text-[10px] font-bold text-navy-900">
                    {reservation.property_type}
                  </span>
                  <h3 className="mt-1 text-lg font-black text-neutral-900">{reservation.property_title}</h3>
                  <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 text-neutral-400" /> {reservation.property_address?.line1 || reservation.property_locality}
                    {reservation.property_address?.city ? `, ${reservation.property_address.city}` : ""}
                    {reservation.property_address?.pincode ? ` ${reservation.property_address.pincode}` : ""}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-neutral-700">
                    Unit: {reservation.unit_code} ({reservation.unit_name})
                  </p>
                </div>
              </div>

              {/* Dates */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-neutral-100 pt-5 text-xs">
                <div>
                  <span className="text-neutral-400 block font-medium">Check-In Date</span>
                  <strong className="text-neutral-900 font-bold text-sm block mt-0.5">
                    {reservation.start_date}
                  </strong>
                  <span className="text-[11px] text-neutral-500">From {reservation.check_in_time}</span>
                </div>

                <div>
                  <span className="text-neutral-400 block font-medium">Check-Out Date</span>
                  <strong className="text-neutral-900 font-bold text-sm block mt-0.5">
                    {reservation.end_date}
                  </strong>
                  <span className="text-[11px] text-neutral-500">By {reservation.check_out_time}</span>
                </div>

                <div>
                  <span className="text-neutral-400 block font-medium">Duration & Occupancy</span>
                  <strong className="text-neutral-900 font-bold text-sm block mt-0.5">
                    {reservation.duration_mode === "MONTHLY"
                      ? `${reservation.lease_duration_months} month(s)`
                      : `${reservation.total_nights} night(s)`}
                  </strong>
                  <span className="text-[11px] text-neutral-500">{reservation.guest_count} Occupant(s)</span>
                </div>
              </div>
            </div>

            {/* Check-In Instructions */}
            <div className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              <h3 className="text-base font-bold text-navy-900 flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-action" /> Check-In Instructions
              </h3>
              <div className="mt-4 space-y-3 text-xs text-neutral-600">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-800 font-black text-[10px]">
                    1
                  </span>
                  <span>
                    Bring an original Government Photo ID (Aadhaar Card, Passport, or Driving License) for tenant registration.
                  </span>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-800 font-black text-[10px]">
                    2
                  </span>
                  <span>
                    Meet host <strong>{reservation.host_name}</strong> or the resident property manager at the reception / gate.
                  </span>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-800 font-black text-[10px]">
                    3
                  </span>
                  <span>
                    Complete room inventory verification, collect physical keys/access cards, and sign the digital move-in checklist.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar: Host & Financials */}
          <div className="space-y-6">
            {/* Host Card */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-neutral-900">Your Host</h3>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-900 font-black text-base border border-navy-100">
                  {reservation.host_name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">{reservation.host_name}</h4>
                  {reservation.host_verified ? (
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verified Host Partner
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 font-medium flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-neutral-400" /> Host Verification Pending
                    </p>
                  )}
                  {reservation.host_phone && (
                    <a href={`tel:${reservation.host_phone}`} className="mt-1 flex items-center gap-1 text-xs font-semibold text-action">
                      <Phone className="h-3.5 w-3.5" /> {reservation.host_phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Deposit Escrow Summary */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-amber-600" /> Security Deposit
                </h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                  {reservation.deposit?.status || "HELD_IN_ESCROW"}
                </span>
              </div>
              <div className="mt-3 text-xl font-black text-amber-900">
                {formatPaise(reservation.deposit_amount_paise)}
              </div>
              <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                Securely locked in Vsolve platform escrow. Will be refunded to your original payment method upon move-out inspection.
              </p>
            </div>

            {/* Total Paid */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
                <span>Total Amount Paid</span>
                <span className="text-emerald-700 font-extrabold">
                  {isCancelled ? "REFUNDED" : "PAID IN FULL"}
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-neutral-900">
                {formatPaise(reservation.total_amount_paise)}
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                1st Month Rent + Maintenance + Deposit + Agreement charges
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          Modal 1: Cancellation Modal
          ------------------------------------------------------------- */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy-900 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" /> Cancel Reservation
              </h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-warm-50 p-3 text-xs text-neutral-600 border border-line">
              <p className="font-bold text-navy-900">Cancellation Policy: {cancellationPolicy}</p>
              <p className="mt-1">
                Your ₹{(reservation.deposit_amount_paise / 100).toLocaleString("en-IN")} security deposit will be 100% refunded. Rent refund is calculated according to host notice criteria.
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-navy-900 mb-1">
                Reason for Cancellation
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-xl border border-line p-2.5 text-xs text-neutral-800 bg-white"
              >
                <option value="Change of travel / move-in plans">Change of travel / move-in plans</option>
                <option value="Found alternative accommodation">Found alternative accommodation</option>
                <option value="Date or schedule conflict">Date or schedule conflict</option>
                <option value="Personal emergency">Personal emergency</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Keep Booking
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelReservation}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? "Processing..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          Modal 2: Stay Extension Modal
          ------------------------------------------------------------- */}
      {showExtendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy-900 flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-action" /> Extend Stay
              </h3>
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setExtensionQuote(null);
                }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1 text-xs text-neutral-500">
              Current check-out date: <strong className="text-navy-900">{reservation.end_date}</strong>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-navy-900 mb-1">
                  Additional Nights
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={extensionNights}
                  onChange={(e) => setExtensionNights(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-line p-2 text-xs text-neutral-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-navy-900 mb-1">
                  Additional Months
                </label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={extensionMonths}
                  onChange={(e) => setExtensionMonths(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-line p-2 text-xs text-neutral-800"
                />
              </div>
            </div>

            {!extensionQuote ? (
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExtendModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={quoting || (extensionNights === 0 && extensionMonths === 0)}
                  onClick={handleQuoteExtension}
                  className="rounded-xl bg-action px-4 py-2 text-xs font-bold text-white hover:bg-action-hover disabled:opacity-50"
                >
                  {quoting ? "Checking Availability..." : "Check Availability & Quote"}
                </button>
              </div>
            ) : (
              <div className="mt-4 border-t border-line pt-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
                  <div className="font-bold flex items-center justify-between">
                    <span>New Check-Out Date:</span>
                    <span>{extensionQuote.extended_end_date}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between font-bold text-sm text-emerald-950">
                    <span>Extension Cost:</span>
                    <span>{formatPaise(extensionQuote.additional_amount_paise)}</span>
                  </div>
                  {Boolean(extensionQuote.additional_deposit_paise && extensionQuote.additional_deposit_paise > 0) && (
                    <div className="mt-1 flex items-center justify-between text-xs text-amber-900 border-t border-emerald-200/60 pt-1">
                      <span>Additional Security Deposit:</span>
                      <span className="font-bold">{formatPaise(extensionQuote.additional_deposit_paise!)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setExtensionQuote(null)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                  >
                    Adjust Dates
                  </button>
                  <button
                    type="button"
                    disabled={confirmingExtension}
                    onClick={handleConfirmExtension}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {confirmingExtension ? "Confirming..." : "Confirm & Pay Extension"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          Modal 3: Early Check-Out Modal
          ------------------------------------------------------------- */}
      {showEarlyCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy-900 flex items-center gap-2">
                <LogOut className="h-5 w-5 text-neutral-700" /> Early Check-Out
              </h3>
              <button
                onClick={() => setShowEarlyCheckoutModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-600">
              Departing before your scheduled check-out date (<strong className="text-navy-900">{reservation.end_date}</strong>)? Host will schedule an exit inventory inspection.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-navy-900 mb-1">
                Actual Departure Date
              </label>
              <input
                type="date"
                value={earlyCheckoutDate}
                onChange={(e) => setEarlyCheckoutDate(e.target.value)}
                className="w-full rounded-xl border border-line p-2 text-xs text-neutral-800"
              />
            </div>

            <div className="mt-3">
              <label className="block text-xs font-bold text-navy-900 mb-1">
                Reason
              </label>
              <input
                type="text"
                value={earlyCheckoutReason}
                onChange={(e) => setEarlyCheckoutReason(e.target.value)}
                placeholder="e.g., Job relocation, finished course early"
                className="w-full rounded-xl border border-line p-2 text-xs text-neutral-800"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEarlyCheckoutModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={earlyCheckingOut}
                onClick={handleEarlyCheckout}
                className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {earlyCheckingOut ? "Recording..." : "Confirm Early Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          Modal 4: Damage / Deposit Dispute Modal
          ------------------------------------------------------------- */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" /> Dispute Security Deposit Deductions
              </h3>
              <button
                onClick={() => setShowDisputeModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
              If the host has claimed deductions you disagree with, submitting a dispute freezes the deposit and initiates an Operations Maker-Checker case.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-navy-900 mb-1">
                Dispute Statement & Evidence Grounds
              </label>
              <textarea
                rows={4}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Explain why this deduction is incorrect (e.g., pre-existing wear and tear, move-in photo proof available)..."
                className="w-full rounded-xl border border-line p-2 text-xs text-neutral-800 focus:outline-action"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disputing || !disputeReason.trim()}
                onClick={handleDisputeDamage}
                className="rounded-xl bg-action px-4 py-2 text-xs font-bold text-white hover:bg-action-hover disabled:opacity-50"
              >
                {disputing ? "Submitting Dispute..." : "Submit to Operations"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
