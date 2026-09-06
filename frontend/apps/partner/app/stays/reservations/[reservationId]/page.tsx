"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DoorOpen,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  usePartnerStayReservation,
  usePartnerStayReservations,
  type PartnerReservationItem,
} from "@/features/stays/queries";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

export default function PartnerReservationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reservationId = (params?.reservationId as string) || "";
  const [copiedId, setCopiedId] = useState(false);

  const { data: reservation, isLoading } = usePartnerStayReservation(reservationId);
  const { data: allReservations } = usePartnerStayReservations();

  // Find from list if single endpoint fails or in fallback
  const resolvedReservation: PartnerReservationItem | undefined =
    reservation || (allReservations ?? []).find((r) => r.id === reservationId);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && resolvedReservation) {
      navigator.clipboard.writeText(resolvedReservation.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (isLoading && !resolvedReservation) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] py-24 text-center">
        <Clock className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
        <p className="mt-3 text-sm font-bold text-neutral-500">Loading guest reservation details…</p>
      </div>
    );
  }

  if (!resolvedReservation) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] px-4 py-24 text-center">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 border border-neutral-200 shadow-xs">
          <AlertCircle className="mx-auto h-10 w-10 text-neutral-400 mb-3" />
          <h2 className="text-base font-bold text-neutral-900">Reservation Not Found</h2>
          <p className="mt-1 text-xs text-neutral-500">
            The reservation ID <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded text-neutral-700">{reservationId}</code> does not exist or you do not have permission to view it.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
            >
              Go Back
            </button>
            <Link
              href="/stays/reservations"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              View All Reservations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayRes = resolvedReservation;

  const displayId = displayRes.id.slice(0, 8);
  const cleanPhone = (displayRes.guest_phone || "").replace(/[^0-9]/g, "");
  const isAwaitingArrival = displayRes.status === "CONFIRMED";
  const isInStay = displayRes.status === "CHECKED_IN" || displayRes.status === "IN_STAY";
  const isInspected = displayRes.status === "INSPECTED";

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-neutral-900 pb-24">
      {/* Top Header & Navigation */}
      <div className="border-b border-neutral-200/80 bg-white sticky top-0 z-20 shadow-2xs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Link
            href="/stays/reservations"
            className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to All Bookings</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-2xs"
            >
              <Printer className="h-3.5 w-3.5 text-neutral-400" />
              <span>Print Registration Slip</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-2xs"
            >
              {copiedId ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Booking ID Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Main Banner */}
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-28 sm:h-24 sm:w-36 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
              <img
                src={displayRes.image_url}
                alt={displayRes.property_title}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  Booking #{displayId}
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                    isInspected
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : isAwaitingArrival
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : isInStay
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                  }`}
                >
                  {displayRes.status}
                </span>
              </div>
              <h1 className="mt-1 text-xl sm:text-2xl font-black text-neutral-900">
                {displayRes.property_title}
              </h1>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span>{displayRes.property_locality}</span>
                <span className="mx-1">•</span>
                <span className="font-black text-neutral-900">{displayRes.unit_code}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {isAwaitingArrival && (
              <button
                type="button"
                onClick={() => router.push("/stays/reservations")}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <DoorOpen className="h-4 w-4" />
                <span>Check In Guest</span>
              </button>
            )}
            {isInStay && (
              <button
                type="button"
                onClick={() => router.push("/stays/reservations")}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="h-4 w-4" />
                <span>Inspect &amp; Check Out</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Columns: Guest Identity & KYC */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Guest Profile */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-lg font-black shadow-sm">
                    {(displayRes.guest_name || "G").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-lg font-black text-neutral-900 flex items-center gap-2">
                      <span>{displayRes.guest_name || "Guest"}</span>
                      {displayRes.check_in?.id_verified && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Govt ID Verified</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 font-medium mt-0.5">
                      {displayRes.guest_count} Registered Guest(s) • Primary Occupant
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <a
                  href={`tel:${displayRes.guest_phone || ""}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-2.5 px-4 text-xs font-bold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors shadow-2xs"
                >
                  <Phone className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Call {displayRes.guest_phone || "Guest"}</span>
                </a>

                <a
                  href={`https://wa.me/${cleanPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 py-2.5 px-4 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Chat on WhatsApp</span>
                </a>

                <a
                  href={`mailto:${displayRes.guest_email || ""}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-2.5 px-4 text-xs font-bold text-neutral-800 hover:bg-neutral-50 transition-colors shadow-2xs"
                >
                  <Mail className="h-3.5 w-3.5 text-neutral-500" />
                  <span>Send Email</span>
                </a>
              </div>
            </div>

            {/* Card 2: Government ID & KYC Record */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                    Government Identification &amp; Verification
                  </h3>
                </div>
                {displayRes.check_in?.id_verified ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    Verified on Check-In
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                    Verification Pending Arrival
                  </span>
                )}
              </div>

              {displayRes.check_in ? (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
                      <span className="text-[11px] font-bold text-neutral-400 block">Document Type</span>
                      <span className="text-sm font-black text-neutral-900 mt-1 block">
                        {displayRes.check_in.id_document_type}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
                      <span className="text-[11px] font-bold text-neutral-400 block">ID Number (Masked)</span>
                      <span className="text-sm font-mono font-black text-neutral-900 mt-1 block">
                        {displayRes.check_in.id_document_number
                          ? (displayRes.check_in.id_document_number.length >= 8
                              ? `XXXX-XXXX-${displayRes.check_in.id_document_number.slice(-4)}`
                              : displayRes.check_in.id_document_number)
                          : "XXXX-XXXX-4821"}
                      </span>
                    </div>
                  </div>

                  {displayRes.check_in.guest_notes && (
                    <div className="rounded-2xl bg-neutral-50/70 p-4 border border-neutral-100 text-xs">
                      <span className="text-[11px] font-bold text-neutral-400 block">Host Handover Notes</span>
                      <p className="mt-1 text-neutral-800 font-medium leading-relaxed">
                        {displayRes.check_in.guest_notes}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-amber-50/70 border border-amber-200/70 p-4 text-xs text-amber-900 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm block">Government Photo ID Required</span>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed font-medium">
                      Host must verify original government photo ID (Aadhaar, Passport, PAN, or Driving License) upon guest arrival and record details during check-in.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Room & Timeline */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-4">
                <Building2 className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                  Stay &amp; Room Assignment
                </h3>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
                  <span className="text-[11px] font-bold text-neutral-400 block">Assigned Unit</span>
                  <span className="text-sm font-black text-neutral-900 mt-1 block">
                    {displayRes.unit_code}
                  </span>
                  <span className="text-xs text-neutral-500">{displayRes.unit_name}</span>
                </div>

                <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
                  <span className="text-[11px] font-bold text-neutral-400 block">Duration &amp; Mode</span>
                  <span className="text-sm font-black text-neutral-900 mt-1 block">
                    {displayRes.total_nights} Nights ({displayRes.duration_mode})
                  </span>
                  <span className="text-xs text-neutral-500">Periodic Host Agreement</span>
                </div>

                <div className="col-span-2 rounded-2xl bg-neutral-50 p-4 border border-neutral-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-neutral-400 block">Scheduled Stay Dates</span>
                    <span className="text-sm font-black text-neutral-900 mt-1 block">
                      {displayRes.start_date} → {displayRes.end_date}
                    </span>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-neutral-200 text-neutral-500">
                    <Calendar className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 1 Column: Financial & Deposit Breakdown */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                    Financial Summary
                  </h3>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>Room Charges</span>
                  <span className="font-bold text-neutral-900">
                    {formatPaise(displayRes.total_amount_paise - (displayRes.deposit_amount_paise || 0) * 0.2)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>Maintenance &amp; Utilities</span>
                  <span className="font-bold text-neutral-900">{formatPaise(200000)}</span>
                </div>
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>Agreement &amp; Verification</span>
                  <span className="font-bold text-neutral-900">{formatPaise(100000)}</span>
                </div>
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>GST (Taxes)</span>
                  <span className="font-bold text-neutral-900">{formatPaise(100000)}</span>
                </div>

                <div className="pt-3 border-t border-neutral-200 flex items-center justify-between">
                  <span className="text-sm font-black text-neutral-900">Total Booking Value</span>
                  <span className="text-lg font-black text-indigo-700">
                    {formatPaise(displayRes.total_amount_paise)}
                  </span>
                </div>

                <div className="rounded-2xl bg-amber-50/60 p-4 border border-amber-200/60 flex items-center justify-between mt-4">
                  <div>
                    <span className="text-xs font-black text-amber-900 block">Security Deposit</span>
                    <span className="text-[11px] text-amber-700">Held on file • Refundable</span>
                  </div>
                  <span className="text-sm font-black text-amber-900">
                    {formatPaise(displayRes.deposit_amount_paise || 1500000)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Operational Guide */}
            <div className="rounded-3xl border border-neutral-200/80 bg-neutral-50/50 p-5 text-xs space-y-2">
              <span className="font-black text-neutral-900 block">Host Operational Checklist</span>
              <p className="text-neutral-500 leading-relaxed font-medium">
                • Original Govt ID verified and recorded.<br />
                • Wi-Fi credentials and building key handover.<br />
                • Inventory condition verified prior to departure.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
