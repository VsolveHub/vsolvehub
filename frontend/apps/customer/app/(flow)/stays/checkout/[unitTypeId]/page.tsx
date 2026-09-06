"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  CreditCard,
  HelpCircle,
  Lock,
  MapPin,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import {
  createStayHold,
  fetchPaymentAttempt,
  fetchStayBrowse,
  fetchStayReservation,
  releaseStayHold,
  simulateStayPayment,
  startStayPayment,
  type StayBrowseUnitCard,
  type StayReservationDetail,
} from "@/features/stays/queries";
import { handoffTarget, openProviderCheckout } from "@/features/payment/model/provider-handoff";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

export default function StayCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitTypeId = params?.unitTypeId as string;

  const [unitCard, setUnitCard] = useState<StayBrowseUnitCard | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Booking Parameters (Step 11)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfterTomorrowStr = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
  const requestedParam = searchParams.get("duration_mode")?.toUpperCase();
  const requestedMode: "MONTHLY" | "WEEKLY" | "NIGHTLY" =
    requestedParam === "WEEKLY" ? "WEEKLY" : requestedParam === "NIGHTLY" ? "NIGHTLY" : "MONTHLY";
  const [durationMode, setDurationMode] = useState<"MONTHLY" | "WEEKLY" | "NIGHTLY">(requestedMode);
  const [startDate, setStartDate] = useState<string>(searchParams.get("start_date") || tomorrowStr);
  const [checkoutDate, setCheckoutDate] = useState<string>(searchParams.get("end_date") || dayAfterTomorrowStr);
  const [leaseMonths, setLeaseMonths] = useState<number>(11);
  const [leaseWeeks, setLeaseWeeks] = useState<number>(1);
  const [guestCount, setGuestCount] = useState<number>(1);

  // Payment Method Selection (Step 12)
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "CARD" | "NETBANKING">("UPI");
  const [processing, setProcessing] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [heldReservation, setHeldReservation] = useState<StayReservationDetail | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [kycDocument, setKycDocument] = useState<File | null>(null);
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  const calculateEndDate = (start: string, months: number): string => {
    const d = new Date(start || Date.now());
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  };

  const calculateWeeklyEndDate = (start: string, weeks: number): string => {
    const d = new Date(start || Date.now());
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };

  const effectiveEndDate =
    durationMode === "MONTHLY"
      ? calculateEndDate(startDate, leaseMonths)
      : durationMode === "WEEKLY"
      ? calculateWeeklyEndDate(startDate, leaseWeeks)
      : checkoutDate;

  // Compute Nights
  const nights = Math.max(
    1,
    Math.round((new Date(checkoutDate).getTime() - new Date(startDate).getTime()) / 86400000) || 1
  );

  useEffect(() => {
    if (!unitTypeId) return;
    setLoading(true);
    // 1. Direct targeted unit_type_id lookup
    fetchStayBrowse({
      unit_type_id: unitTypeId,
      start_date: startDate,
      end_date: effectiveEndDate,
      duration_mode: durationMode,
    })
      .then((items) => {
        if (items.length > 0) {
          setUnitCard(items[0]);
          setLoading(false);
          return;
        }
        // 2. Fallback to general browse
        return fetchStayBrowse().then((all) => {
          const found = all.find((u) => u.unit_type_id === unitTypeId);
          if (found) {
            setUnitCard(found);
          } else {
            setError("Requested room unit not found in active listings.");
          }
          setLoading(false);
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load checkout details.");
        setLoading(false);
      });
  }, [unitTypeId, startDate, effectiveEndDate, durationMode]);

  const supportedModes = useMemo(() => {
    if (!unitCard) return ["MONTHLY", "WEEKLY", "NIGHTLY"];
    if (unitCard.supported_duration_modes && unitCard.supported_duration_modes.length > 0) {
      return unitCard.supported_duration_modes;
    }
    return [unitCard.duration_mode || "MONTHLY"];
  }, [unitCard]);

  const hasMonthly = supportedModes.includes("MONTHLY");
  const hasWeekly = supportedModes.includes("WEEKLY");
  const hasNightly = supportedModes.includes("NIGHTLY") || supportedModes.includes("DAILY");

  useEffect(() => {
    if (!unitCard) return;
    const modes = unitCard.supported_duration_modes || [unitCard.duration_mode || "MONTHLY"];
    if (durationMode === "WEEKLY" && !modes.includes("WEEKLY")) {
      const fallback = modes.includes("MONTHLY") ? "MONTHLY" : modes.includes("NIGHTLY") ? "NIGHTLY" : "MONTHLY";
      setDurationMode(fallback);
      setProcessError(
        "Weekly duration is not configured for this room; defaulted to " +
          (fallback === "MONTHLY" ? "Monthly lease." : "Short stay.")
      );
    }
  }, [unitCard, durationMode]);

  // Compute Line Items & Totals
  const monthlyRentPaise = unitCard?.monthly_rate_paise || unitCard?.price_paise || 0;
  const dailyRatePaise =
    unitCard?.daily_rate_paise || Math.max(50000, Math.round(monthlyRentPaise / 30));
  const weeklyRatePaise = dailyRatePaise * 7;

  const monthlyPeriods = durationMode === "MONTHLY" ? leaseMonths : Math.max(1, Math.ceil(nights / 30));
  const estimatedTariff =
    durationMode === "MONTHLY"
      ? monthlyRentPaise * monthlyPeriods
      : durationMode === "WEEKLY"
      ? weeklyRatePaise * leaseWeeks
      : dailyRatePaise * nights;
  const estimatedMaintenance = durationMode === "MONTHLY" ? (unitCard?.maintenance_paise || 0) * monthlyPeriods : 0;
  const estimatedDeposit = unitCard?.deposit_paise || 0;
  const estimatedTax = durationMode === "MONTHLY"
    ? Math.floor(estimatedMaintenance * 0.18)
    : Math.floor(estimatedTariff * 0.12);
  const stayTariffPaise = heldReservation?.base_amount_paise ?? estimatedTariff;
  const maintenancePaise = heldReservation?.maintenance_amount_paise ?? estimatedMaintenance;
  const depositPaise = heldReservation?.deposit_amount_paise ?? estimatedDeposit;
  const oneTimeChargesPaise = heldReservation?.one_time_charges_paise ?? 0;
  const taxPaise = heldReservation?.tax_amount_paise ?? estimatedTax;
  const totalPayableNowPaise = heldReservation?.total_amount_paise ??
    stayTariffPaise + maintenancePaise + depositPaise + oneTimeChargesPaise + taxPaise;

  const waitForCapture = async (initial: Awaited<ReturnType<typeof fetchPaymentAttempt>>) => {
    let current = initial;
    if (current.simulated_capture_available) {
      current = await simulateStayPayment(current.id);
    } else {
      const target = handoffTarget(current);
      if (!target) throw new Error("This payment cannot be opened. Please contact support.");
      await openProviderCheckout(target, { businessName: "Vsolve Hub" });
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      current = await fetchPaymentAttempt(current.id);
      if (current.status === "CAPTURED" || current.status === "PARTIALLY_REFUNDED") return current;
      if (current.status === "FAILED" || current.status === "EXPIRED" || current.status === "REFUNDED") {
        throw new Error(`Payment ended with status ${current.status}.`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    throw new Error("Payment confirmation is still pending. Reopen this booking shortly.");
  };

  const handlePayAndConfirm = async () => {
    if (!unitCard) return;
    setProcessing(true);
    setProcessError(null);

    try {
      if (!tenantName.trim() || !tenantPhone.trim() || !tenantEmail.trim()) {
        throw new Error("Enter the primary tenant name, phone, and email.");
      }
      if (!emergencyName.trim() || !emergencyPhone.trim()) {
        throw new Error("Enter an emergency contact.");
      }
      if (!agreementAccepted) throw new Error("Accept the house rules and tenant agreement.");
      if (!kycDocument) throw new Error("Upload a government-issued ID document.");

      if (durationMode === "WEEKLY" && !hasWeekly) {
        setProcessError("Weekly stay pricing is not configured for this room. Please choose an available duration mode.");
        setProcessing(false);
        return;
      }

      let held = heldReservation;
      if (!held) {
        held = await createStayHold({
          unit_type_id: unitCard.unit_type_id,
          start_date: startDate,
          end_date: effectiveEndDate,
          duration_mode: durationMode,
          guest_count: guestCount,
          lease_duration_months: durationMode === "MONTHLY" ? leaseMonths : 1,
          primary_tenant_name: tenantName,
          guest_phone: tenantPhone,
          guest_email: tenantEmail,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
          agreement_version: "A9-STAY-2026-09",
          agreement_accepted: true,
          kyc_document: kycDocument,
        });
        setHeldReservation(held);
        setProcessing(false);
        return;
      }

      const attempts = await startStayPayment(held.id);
      for (const attempt of attempts) await waitForCapture(attempt);
      const confirmed = await fetchStayReservation(held.id);
      if (confirmed.status !== "CONFIRMED") {
        throw new Error("Payments were received and reservation confirmation is being reconciled.");
      }
      router.push(`/stays/bookings/${confirmed.id}`);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Payment confirmation failed. Please try again.");
      setProcessing(false);
    }
  };

  const handleReleaseHold = async () => {
    if (!heldReservation) return;
    try {
      await releaseStayHold(heldReservation.id);
      setHeldReservation(null);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Could not release the hold.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] py-20 text-center">
        <Clock className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
        <p className="mt-3 text-sm font-semibold text-neutral-500">Preparing secure checkout…</p>
      </div>
    );
  }

  if (error || !unitCard) {
    return (
      <div className="min-h-screen bg-[#FBFBFC] px-4 py-20 text-center">
        <div className="mx-auto max-w-md rounded-2xl bg-red-50 p-6 border border-red-200">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <h2 className="text-base font-bold text-red-800">Checkout Error</h2>
          <p className="mt-1 text-xs text-red-600">{error || "Could not retrieve room details."}</p>
          <Link
            href="/stays"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-signal-700 hover:text-action"
          >
            ← Back to Stays
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 text-navy-900">
      {/* Checkout Header */}
      <div className="border-b border-line bg-white px-4 py-3 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <Link
            href={`/stays/property/${unitCard.property_id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Property
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
            <Lock className="h-3.5 w-3.5 text-emerald-600" /> 256-Bit Encrypted Secure Checkout
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
            Reserve Your Stay & Move-In
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-500">
            Transparent pricing breakdown with refundable security deposit held in platform escrow.
          </p>
        </div>

        {processError && (
          <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {processError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Booking Parameters & Payment Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 11: Booking Parameters */}
            <div className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-action text-white font-black text-xs">
                  1
                </span>
                <h2 className="text-base font-black text-navy-900">Move-In Details & Duration</h2>
              </div>

              {/* Segmented Duration Mode Toggle */}
              <div className="mt-4 flex items-center gap-2 p-1 bg-warm-50 rounded-xl border border-line">
                <button
                  type="button"
                  disabled={!!heldReservation || !hasMonthly}
                  onClick={() => setDurationMode("MONTHLY")}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    durationMode === "MONTHLY"
                      ? "bg-navy-900 text-white shadow-xs"
                      : !hasMonthly
                      ? "opacity-40 cursor-not-allowed text-neutral-400"
                      : "text-text-secondary hover:text-navy-900"
                  }`}
                  title={!hasMonthly ? "Monthly lease is not offered for this unit" : undefined}
                >
                  Monthly Lease {!hasMonthly && <span className="text-[10px] font-normal block text-neutral-400">(Unavailable)</span>}
                </button>
                <button
                  type="button"
                  disabled={!!heldReservation || !hasWeekly}
                  onClick={() => setDurationMode("WEEKLY")}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    durationMode === "WEEKLY"
                      ? "bg-navy-900 text-white shadow-xs"
                      : !hasWeekly
                      ? "opacity-40 cursor-not-allowed text-neutral-400"
                      : "text-text-secondary hover:text-navy-900"
                  }`}
                  title={!hasWeekly ? "Weekly stay is not offered for this unit" : undefined}
                >
                  Weekly Stay {!hasWeekly && <span className="text-[10px] font-normal block text-neutral-400">(Unavailable)</span>}
                </button>
                <button
                  type="button"
                  disabled={!!heldReservation || !hasNightly}
                  onClick={() => setDurationMode("NIGHTLY")}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    durationMode === "NIGHTLY"
                      ? "bg-navy-900 text-white shadow-xs"
                      : !hasNightly
                      ? "opacity-40 cursor-not-allowed text-neutral-400"
                      : "text-text-secondary hover:text-navy-900"
                  }`}
                  title={!hasNightly ? "Daily short stays are not offered for this unit" : undefined}
                >
                  Short Stay {!hasNightly && <span className="text-[10px] font-normal block text-neutral-400">(Unavailable)</span>}
                </button>
              </div>

              {durationMode === "MONTHLY" ? (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-900">Move-In Date</label>
                    <input
                      type="date"
                      required
                      disabled={!!heldReservation}
                      min={tomorrowStr}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Lease Duration</label>
                    <select
                      disabled={!!heldReservation}
                      value={leaseMonths}
                      onChange={(e) => setLeaseMonths(parseInt(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value={1}>1 Month (Flexible)</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={11}>11 Months (Standard Lease)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Total Occupants</label>
                    <select
                      disabled={!!heldReservation}
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value={1}>1 Guest</option>
                      <option value={2}>2 Guests</option>
                      <option value={3}>3 Guests</option>
                      <option value={4}>4 Guests</option>
                      <option value={5}>5+ Guests</option>
                    </select>
                  </div>
                </div>
              ) : durationMode === "WEEKLY" ? (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-900">Move-In Date</label>
                    <input
                      type="date"
                      required
                      disabled={!!heldReservation}
                      min={tomorrowStr}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Weeks Duration</label>
                    <select
                      disabled={!!heldReservation}
                      value={leaseWeeks}
                      onChange={(e) => setLeaseWeeks(parseInt(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value={1}>1 Week (7 Days)</option>
                      <option value={2}>2 Weeks (14 Days)</option>
                      <option value={3}>3 Weeks (21 Days)</option>
                      <option value={4}>4 Weeks (28 Days)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Total Occupants</label>
                    <select
                      disabled={!!heldReservation}
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value={1}>1 Guest</option>
                      <option value={2}>2 Guests</option>
                      <option value={3}>3 Guests</option>
                      <option value={4}>4 Guests</option>
                      <option value={5}>5+ Guests</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-900">Check-In Date</label>
                    <input
                      type="date"
                      required
                      disabled={!!heldReservation}
                      min={tomorrowStr}
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value >= checkoutDate) {
                          const nextD = new Date(new Date(e.target.value).getTime() + 86400000)
                            .toISOString()
                            .slice(0, 10);
                          setCheckoutDate(nextD);
                        }
                      }}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Check-Out Date</label>
                    <input
                      type="date"
                      required
                      disabled={!!heldReservation}
                      min={startDate}
                      value={checkoutDate}
                      onChange={(e) => setCheckoutDate(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-900">Total Occupants</label>
                    <select
                      disabled={!!heldReservation}
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      <option value={1}>1 Guest</option>
                      <option value={2}>2 Guests</option>
                      <option value={3}>3 Guests</option>
                      <option value={4}>4 Guests</option>
                      <option value={5}>5+ Guests</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 flex items-center justify-between">
                <span>{durationMode === "MONTHLY" ? "Lease Period:" : durationMode === "WEEKLY" ? "Weekly Period:" : "Stay Duration:"}</span>
                <strong className="text-neutral-900">
                  {startDate} → {effectiveEndDate} ({durationMode === "MONTHLY" ? `${leaseMonths} month${leaseMonths > 1 ? "s" : ""}` : durationMode === "WEEKLY" ? `${leaseWeeks} week${leaseWeeks > 1 ? "s" : ""}` : `${nights} night${nights > 1 ? "s" : ""}`})
                </strong>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-action text-white font-black text-xs">2</span>
                <h2 className="text-base font-black text-navy-900">Tenant, Emergency Contact &amp; Verification</h2>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-navy-900">Primary tenant name
                  <input disabled={!!heldReservation} value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line p-2.5 text-xs disabled:bg-neutral-100" />
                </label>
                <label className="text-xs font-bold text-navy-900">Tenant phone
                  <input disabled={!!heldReservation} type="tel" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line p-2.5 text-xs disabled:bg-neutral-100" />
                </label>
                <label className="text-xs font-bold text-navy-900">Tenant email
                  <input disabled={!!heldReservation} type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line p-2.5 text-xs disabled:bg-neutral-100" />
                </label>
                <label className="text-xs font-bold text-navy-900">Emergency contact name
                  <input disabled={!!heldReservation} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line p-2.5 text-xs disabled:bg-neutral-100" />
                </label>
                <label className="text-xs font-bold text-navy-900">Emergency contact phone
                  <input disabled={!!heldReservation} type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line p-2.5 text-xs disabled:bg-neutral-100" />
                </label>
                <label className="text-xs font-bold text-navy-900">Government ID document
                  <input disabled={!!heldReservation} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setKycDocument(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-xl border border-line p-2 text-xs disabled:bg-neutral-100" />
                </label>
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs text-neutral-700">
                <input disabled={!!heldReservation} type="checkbox" checked={agreementAccepted} onChange={(e) => setAgreementAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>I accept the property house rules and the A9 tenant agreement. These terms and the policy version will be snapshotted with my reservation.</span>
              </label>
              {heldReservation && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <span><strong>Price locked.</strong> Hold {heldReservation.id.slice(0, 8)} is active; the breakdown now comes directly from Django.</span>
                  <button type="button" onClick={handleReleaseHold} className="font-bold underline">Release hold</button>
                </div>
              )}
            </div>

            {/* Step 12: Payment Methods */}
            <div className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-action text-white font-black text-xs">
                  2
                </span>
                <h2 className="text-base font-black text-navy-900">3. Select Payment Method</h2>
              </div>

              <div className="mt-5 space-y-3">
                {/* UPI Option */}
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    paymentMethod === "UPI"
                      ? "border-action bg-signal-50/20"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="payMethod"
                    checked={paymentMethod === "UPI"}
                    onChange={() => setPaymentMethod("UPI")}
                    className="mt-1 h-4 w-4 text-action focus:ring-action"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-navy-900 flex items-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-action" /> UPI Instant (GPay / PhonePe / Paytm / BHIM)
                      </span>
                      <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.2">
                        Fastest
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Select and authorize your UPI app in the secure payment window.
                    </p>
                  </div>
                </label>

                {/* Credit / Debit Card */}
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    paymentMethod === "CARD"
                      ? "border-action bg-signal-50/20"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="payMethod"
                    checked={paymentMethod === "CARD"}
                    onChange={() => setPaymentMethod("CARD")}
                    className="mt-1 h-4 w-4 text-action focus:ring-action"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-xs text-navy-900 flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-warm-600" /> Credit / Debit Card (Visa, MasterCard, RuPay)
                    </span>
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      Zero convenience fee on domestic debit cards.
                    </p>
                  </div>
                </label>

                {/* Net Banking */}
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    paymentMethod === "NETBANKING"
                      ? "border-action bg-signal-50/20"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="payMethod"
                    checked={paymentMethod === "NETBANKING"}
                    onChange={() => setPaymentMethod("NETBANKING")}
                    className="mt-1 h-4 w-4 text-action focus:ring-action"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-xs text-navy-900 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-warm-600" /> Net Banking (All Major Indian Banks)
                    </span>
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      SBI, HDFC, ICICI, Axis, Kotak, and 50+ banks supported.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Escrow Guarantee Banner */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 flex items-start gap-3 text-xs text-amber-900">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block text-neutral-900">Vsolve Deposit Escrow Guarantee</strong>
                <span>
                  Your refundable security deposit ({formatPaise(depositPaise)}) is held securely in platform escrow. It is only released or deducted upon formal checkout inspection approval.
                </span>
              </div>
            </div>
          </div>

          {/* Right: Selected Property Summary & Price Breakdown */}
          <div className="space-y-6">
            {/* Property Summary Card */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-start gap-3.5">
                {unitCard.image_url ? (
                  <img
                    src={unitCard.image_url}
                    alt={unitCard.property_title}
                    className="h-16 w-20 rounded-xl object-cover border border-neutral-100 shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-20 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 shrink-0">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <span className="rounded bg-navy-50 border border-navy-200 px-1.5 py-0.2 text-[10px] font-bold text-navy-900">
                    {unitCard.property_type_display}
                  </span>
                  <h3 className="mt-1 font-extrabold text-sm text-navy-900 line-clamp-1">
                    {unitCard.property_title}
                  </h3>
                  <p className="text-[11px] text-text-secondary">{unitCard.unit_name} ({unitCard.bhk})</p>
                  <p className="text-[11px] text-warm-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" /> {unitCard.locality}
                  </p>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="mt-5 border-t border-line pt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-text-secondary">
                  <span>
                    {durationMode === "MONTHLY"
                      ? `Lease Rent (${leaseMonths} month${leaseMonths > 1 ? "s" : ""} @ ${formatPaise(monthlyRentPaise)}/mo)`
                      : durationMode === "WEEKLY"
                      ? `Room Tariff (${leaseWeeks} week${leaseWeeks > 1 ? "s" : ""} @ ${formatPaise(weeklyRatePaise)}/wk)`
                      : `Room Tariff (${nights} night${nights > 1 ? "s" : ""} @ ${formatPaise(dailyRatePaise)}/nt)`}
                  </span>
                  <span className="font-bold text-navy-900">{formatPaise(stayTariffPaise)}</span>
                </div>

                {maintenancePaise > 0 && (
                  <div className="flex items-center justify-between text-text-secondary">
                    <span>
                      {durationMode === "MONTHLY"
                        ? `Maintenance (${leaseMonths} month${leaseMonths > 1 ? "s" : ""})`
                        : "Maintenance"}
                    </span>
                    <span className="font-bold text-navy-900">{formatPaise(maintenancePaise)}</span>
                  </div>
                )}

                {depositPaise > 0 && (
                  <div className="flex items-center justify-between text-signal-700 bg-signal-50/50 p-2 rounded-lg border border-signal-200">
                    <span className="font-semibold">Refundable Security Deposit</span>
                    <span className="font-extrabold">{formatPaise(depositPaise)}</span>
                  </div>
                )}

                {oneTimeChargesPaise > 0 && (
                  <div className="flex items-center justify-between text-text-secondary">
                    <span>One-time charges</span>
                    <span className="font-bold text-navy-900">{formatPaise(oneTimeChargesPaise)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-text-secondary">
                  <span>Taxes calculated by Vsolve</span>
                  <span className="font-bold text-navy-900">{formatPaise(taxPaise)}</span>
                </div>

                <div className="border-t border-line pt-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-black text-navy-900 block">Total Due Now</span>
                    <span className="text-[10px] text-text-muted">
                      {durationMode === "MONTHLY"
                        ? "Includes 1st month + deposit"
                        : durationMode === "WEEKLY"
                        ? `Total for ${leaseWeeks} week stay`
                        : `Total for ${nights} night stay`}
                    </span>
                  </div>
                  <span className="text-xl font-black text-action">
                    {formatPaise(totalPayableNowPaise)}
                  </span>
                </div>
              </div>

              {/* Pay Button */}
              <div className="mt-6">
                <button
                  onClick={handlePayAndConfirm}
                  disabled={processing}
                  className="w-full rounded-xl bg-action py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-signal-400 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {processing ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Capturing Payment & Reserving…
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      {heldReservation
                        ? `Pay ${formatPaise(totalPayableNowPaise)} & Confirm`
                        : "Lock price & review"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
