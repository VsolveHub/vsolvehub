"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  Clock,
  Lock,
  MapPin,
  ShieldCheck,
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
import { useCustomerProfile } from "@/features/account/queries";
import { useCustomerSession } from "@/features/session/queries";
import { formatMoney } from "@vsolve/ui";
import {
  durationModeLabel,
  holdGuestCount,
  isoDatePlusDays,
  leaseMonthsFromDates,
  occupancyGuestCap,
  publishedDurationModes,
  shouldShowDurationToggle,
  shouldShowOccupantPicker,
  stayNights,
  type StayDurationMode,
} from "@/features/stays/stay-checkout-rules";

// Thin wrapper so every call site keeps using formatPaise (paise is the
// unit stored everywhere) while the actual currency formatting lives in one
// place: @vsolve/ui's formatMoney (locale grouping, paise-only-when-needed).
function formatPaise(paise: number): string {
  return formatMoney(paise);
}

/**
 * Wave U3 (Django_Next.js_Plan/M3/07-a9-stays-ux-overhaul-plan.md): a rough,
 * clearly-labeled estimate shown *before* a price hold exists, so the price
 * card is never empty while a customer is deciding whether to lock a stay
 * (previously nothing was shown until after the hold, which read as a
 * bait-and-switch). This is intentionally approximate -- the same
 * daily-rate x 7 approximation for a weekly estimate already used on the
 * property page -- and is always labeled "Estimated"; the authoritative
 * figures still only come from the server once a hold is created below.
 */
function estimateTariffPaise(
  card: StayBrowseUnitCard,
  mode: StayDurationMode,
  nights: number,
): number | null {
  if (mode === "MONTHLY" && card.monthly_rate_paise) return card.monthly_rate_paise;
  if (mode === "NIGHTLY" && card.daily_rate_paise) return card.daily_rate_paise * nights;
  if (mode === "WEEKLY") {
    if (card.daily_rate_paise) return card.daily_rate_paise * nights;
    if (card.monthly_rate_paise) return card.monthly_rate_paise;
  }
  return card.price_paise || null;
}

export default function StayCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitTypeId = params?.unitTypeId as string;
  const session = useCustomerSession();
  const profile = useCustomerProfile(session.isAuthenticated);

  const [unitCard, setUnitCard] = useState<StayBrowseUnitCard | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const tomorrowStr = isoDatePlusDays(new Date().toISOString().slice(0, 10), 1);
  const requestedParam = searchParams.get("duration_mode")?.toUpperCase();
  const requestedMode: StayDurationMode | null =
    requestedParam === "WEEKLY" || requestedParam === "NIGHTLY" || requestedParam === "MONTHLY"
      ? requestedParam
      : requestedParam === "DAILY"
        ? "NIGHTLY"
        : null;
  const [durationMode, setDurationMode] = useState<StayDurationMode | null>(requestedMode);
  const [startDate, setStartDate] = useState<string>(searchParams.get("start_date") || tomorrowStr);
  const [checkoutDate, setCheckoutDate] = useState<string>(
    searchParams.get("end_date") || isoDatePlusDays(searchParams.get("start_date") || tomorrowStr, 1),
  );
  const [guestCount, setGuestCount] = useState<number>(1);
  const [editingGuest, setEditingGuest] = useState(false);

  // Payment Method Selection (Step 12)
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

  const effectiveEndDate = checkoutDate;
  const nights = stayNights(startDate, checkoutDate);
  const leaseMonths = leaseMonthsFromDates(startDate, checkoutDate);

  useEffect(() => {
    if (!unitTypeId) return;
    setLoading(true);
    // 1. Direct targeted unit_type_id lookup
    fetchStayBrowse({
      unit_type_id: unitTypeId,
      start_date: startDate,
      end_date: effectiveEndDate,
      duration_mode: durationMode ?? undefined,
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

  const supportedModes = useMemo(
    () => publishedDurationModes(unitCard?.supported_duration_modes, unitCard?.duration_mode),
    [unitCard],
  );

  useEffect(() => {
    if (supportedModes.length === 0) return;
    setDurationMode((current) => {
      if (current && supportedModes.includes(current)) return current;
      return supportedModes[0];
    });
  }, [supportedModes]);

  const resolvedDurationMode: StayDurationMode = durationMode ?? supportedModes[0] ?? "MONTHLY";
  const showOccupants = shouldShowOccupantPicker(unitCard?.occupancy_model);

  const maxGuests = useMemo(
    () => occupancyGuestCap(unitCard ?? {}),
    [unitCard],
  );

  useEffect(() => {
    if (!session.isAuthenticated) return;
    setTenantName(
      (current) =>
        current || profile.data?.full_name || session.fullName || session.displayName || "",
    );
    setTenantPhone((current) => current || session.phoneNumber || profile.data?.phone_number || "");
    setTenantEmail((current) => current || profile.data?.email || session.email || "");
  }, [
    session.isAuthenticated,
    session.fullName,
    session.displayName,
    session.phoneNumber,
    session.email,
    profile.data,
  ]);

  useEffect(() => {
    setGuestCount((current) => Math.min(Math.max(1, current), maxGuests));
  }, [maxGuests]);

  const stayTariffPaise = heldReservation?.base_amount_paise ?? null;
  const maintenancePaise = heldReservation?.maintenance_amount_paise ?? null;
  const depositPaise = heldReservation?.deposit_amount_paise ?? null;
  const oneTimeChargesPaise = heldReservation?.one_time_charges_paise ?? null;
  const taxPaise = heldReservation?.tax_amount_paise ?? null;
  const totalPayableNowPaise = heldReservation?.total_amount_paise ?? null;

  // Pre-hold estimate (Wave U3 / C1) -- only used while heldReservation is
  // null; once a hold exists the real server figures above always win.
  const estimatedTariffPaise = unitCard
    ? estimateTariffPaise(unitCard, resolvedDurationMode, nights)
    : null;
  const estimatedDepositPaise = unitCard?.deposit_paise ?? null;
  const estimatedMaintenancePaise = unitCard?.maintenance_paise ?? null;
  const estimatedTotalPaise =
    estimatedTariffPaise !== null
      ? estimatedTariffPaise + (estimatedDepositPaise ?? 0) + (estimatedMaintenancePaise ?? 0)
      : null;

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

      if (supportedModes.length > 0 && !supportedModes.includes(resolvedDurationMode)) {
        setProcessError("That stay duration is not offered for this room.");
        setProcessing(false);
        return;
      }

      let held = heldReservation;
      if (!held) {
        held = await createStayHold({
          unit_type_id: unitCard.unit_type_id,
          start_date: startDate,
          end_date: effectiveEndDate,
          duration_mode: resolvedDurationMode,
          guest_count: holdGuestCount(unitCard.occupancy_model, guestCount),
          lease_duration_months: resolvedDurationMode === "MONTHLY" ? leaseMonths : 1,
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
      setProcessError(err instanceof Error ? err.message : "Could not unlock these dates. Please try again.");
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
                <h2 className="text-base font-black text-navy-900">Check-in Details & Duration</h2>
              </div>

              {shouldShowDurationToggle(supportedModes) ? (
                <div
                  data-testid="stay-duration-toggle"
                  className="mt-4 flex items-center gap-2 p-1 bg-warm-50 rounded-xl border border-line"
                >
                  {supportedModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!!heldReservation}
                      onClick={() => setDurationMode(mode)}
                      className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                        resolvedDurationMode === mode
                          ? "bg-navy-900 text-white shadow-xs"
                          : "text-text-secondary hover:text-navy-900"
                      }`}
                    >
                      {durationModeLabel(mode)}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-navy-900">Check-in date</label>
                  <input
                    type="date"
                    required
                    disabled={!!heldReservation}
                    min={tomorrowStr}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value >= checkoutDate) {
                        setCheckoutDate(isoDatePlusDays(e.target.value, 1));
                      }
                    }}
                    className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-navy-900">Check-out date</label>
                  <input
                    type="date"
                    required
                    disabled={!!heldReservation}
                    min={isoDatePlusDays(startDate, 1)}
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                  />
                </div>
                {showOccupants ? (
                  <div>
                    <label className="block text-xs font-bold text-navy-900">
                      Occupants{unitCard.occupancy_capacity ? ` (sleeps ${maxGuests})` : ""}
                    </label>
                    <select
                      data-testid="stay-occupant-select"
                      disabled={!!heldReservation}
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value, 10))}
                      className="mt-1.5 w-full rounded-xl border border-line bg-warm-50/50 p-2.5 text-xs font-semibold text-navy-900 focus:bg-white focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
                    >
                      {Array.from({ length: maxGuests }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} Guest{count > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="self-end rounded-xl bg-neutral-50 p-2.5 text-[11px] text-neutral-600">
                    One bed, one booking.
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 flex items-center justify-between">
                <span>Check-in {startDate} · Check-out {effectiveEndDate}</span>
                <strong className="text-neutral-900">
                  {nights} night{nights > 1 ? "s" : ""}
                  {resolvedDurationMode === "MONTHLY" ? ` · ~${leaseMonths} month${leaseMonths > 1 ? "s" : ""}` : ""}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-action text-white font-black text-xs">2</span>
                <h2 className="text-base font-black text-navy-900">Tenant, Emergency Contact &amp; Verification</h2>
              </div>
              {session.isAuthenticated && tenantName && tenantPhone && tenantEmail && !editingGuest && !heldReservation ? (
                <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-line bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-700">
                    <p className="font-bold text-navy-900">{tenantName}</p>
                    <p>{tenantPhone}</p>
                    <p>{tenantEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingGuest(true)}
                    className="text-xs font-bold text-action underline"
                  >
                    Edit
                  </button>
                </div>
              ) : (
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
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <span><strong>Price locked</strong> for these dates. The totals on the right are confirmed.</span>
                  <button type="button" onClick={handleReleaseHold} className="font-bold underline">Change dates</button>
                </div>
              )}
            </div>

            {/* Escrow Guarantee Banner */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 flex items-start gap-3 text-xs text-amber-900">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block text-neutral-900">Vsolve Deposit Escrow Guarantee</strong>
                <span>
                  {heldReservation
                    ? `${formatPaise(depositPaise ?? 0)} deposit — refundable after checkout, subject to the stay policy.`
                    : (estimatedDepositPaise ?? 0) > 0
                      ? `~${formatPaise(estimatedDepositPaise ?? 0)} deposit — refundable after checkout, subject to the stay policy. Nothing is charged until you confirm payment.`
                      : "Nothing is charged until you confirm payment."}
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

              {/* Price Breakdown — server totals only after a hold exists */}
              <div className="mt-5 border-t border-line pt-4 space-y-2.5 text-xs">
                {heldReservation && stayTariffPaise !== null && totalPayableNowPaise !== null ? (
                  <>
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>
                        {resolvedDurationMode === "MONTHLY"
                          ? `Lease rent (~${leaseMonths} month${leaseMonths > 1 ? "s" : ""})`
                          : `Room tariff (${nights} night${nights > 1 ? "s" : ""})`}
                      </span>
                      <span className="font-bold text-navy-900">{formatPaise(stayTariffPaise)}</span>
                    </div>

                    {(maintenancePaise ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Maintenance</span>
                        <span className="font-bold text-navy-900">{formatPaise(maintenancePaise ?? 0)}</span>
                      </div>
                    )}

                    {(depositPaise ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-signal-700 bg-signal-50/50 p-2 rounded-lg border border-signal-200">
                        <span className="font-semibold">Refundable security deposit</span>
                        <span className="font-extrabold">{formatPaise(depositPaise ?? 0)}</span>
                      </div>
                    )}

                    {(oneTimeChargesPaise ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>One-time charges</span>
                        <span className="font-bold text-navy-900">{formatPaise(oneTimeChargesPaise ?? 0)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Taxes calculated by Vsolve</span>
                      <span className="font-bold text-navy-900">{formatPaise(taxPaise ?? 0)}</span>
                    </div>

                    <div className="border-t border-line pt-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-black text-navy-900 block">Total due now</span>
                        <span className="text-[10px] text-text-muted">Confirmed for these dates</span>
                      </div>
                      <span className="text-xl font-black text-action">
                        {formatPaise(totalPayableNowPaise)}
                      </span>
                    </div>
                  </>
                ) : estimatedTariffPaise !== null ? (
                  <>
                    <p className="rounded-lg bg-warm-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warm-400">
                      Estimated — confirmed once you lock this price
                    </p>
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>
                        {resolvedDurationMode === "MONTHLY"
                          ? `Lease rent (~${leaseMonths} month${leaseMonths > 1 ? "s" : ""})`
                          : `Room tariff (${nights} night${nights > 1 ? "s" : ""})`}
                      </span>
                      <span className="font-bold text-navy-900">{formatPaise(estimatedTariffPaise)}</span>
                    </div>

                    {(estimatedMaintenancePaise ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Maintenance</span>
                        <span className="font-bold text-navy-900">{formatPaise(estimatedMaintenancePaise ?? 0)}</span>
                      </div>
                    )}

                    {(estimatedDepositPaise ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-signal-700 bg-signal-50/50 p-2 rounded-lg border border-signal-200">
                        <span className="font-semibold">Refundable security deposit</span>
                        <span className="font-extrabold">{formatPaise(estimatedDepositPaise ?? 0)}</span>
                      </div>
                    )}

                    <div className="border-t border-line pt-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-black text-navy-900 block">Estimated total</span>
                        <span className="text-[10px] text-text-muted">Taxes added when you lock this price</span>
                      </div>
                      <span className="text-xl font-black text-navy-400">
                        ~{formatPaise(estimatedTotalPaise ?? 0)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-neutral-50 p-3 text-text-secondary leading-relaxed">
                    Totals appear after you lock this stay. Nothing is charged until you pay.
                  </p>
                )}
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
                      {heldReservation ? "Confirming payment…" : "Locking this price…"}
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      {heldReservation && totalPayableNowPaise !== null
                        ? `Pay & confirm stay — ${formatPaise(totalPayableNowPaise)}`
                        : "Lock this price"}
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
