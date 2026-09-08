"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ShieldCheck,
  Truck,
  CreditCard,
  Lock,
  ChevronRight,
  AlertCircle,
  Store,
  RotateCcw,
  MapPin,
  CheckCircle2,
  Info,
} from "lucide-react";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { apiFetch, getStableIdempotencyKey } from "@vsolve/api-client";

interface AssetDetails {
  asset_id: string;
  vendor_name: string;
  title: string;
  daily_price_paise: number;
  deposit_paise: number;
  condition_grade: string;
  description?: string;
  pickup_address?: {
    line1?: string;
    city?: string;
    postal_code?: string;
  } | null;
}

export default function RentalCheckoutPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const assetId = params?.assetId as string;

  const defaultStart = searchParams?.get("start") || new Date().toISOString().split("T")[0];
  const defaultEnd =
    searchParams?.get("end") ||
    new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [deliveryMode, setDeliveryMode] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState({
    line1: "Road No. 12, Banjara Hills",
    city: "Hyderabad",
    pincode: "500034",
  });
  const [asset, setAsset] = useState<AssetDetails | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch asset details to display exact pricing & vendor
  useEffect(() => {
    async function loadAsset() {
      setLoadingAsset(true);
      try {
        const res = await apiFetch(
          `${PUBLIC_API_BASE_URL}/api/v1/rentals/browse/?asset_id=${assetId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAsset(data[0]);
          }
        }
      } catch (err) {
        console.error("Could not load asset details for checkout", err);
      } finally {
        setLoadingAsset(false);
      }
    }

    if (assetId) {
      loadAsset();
    }
  }, [assetId]);

  // Live rental duration calculation
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const rentalDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 3600 * 24)) + 1);

  // Financial calculations (GAP-CP-01: clear escrow pre-auth separation)
  const dailyRateRupees = (asset?.daily_price_paise ?? 60000) / 100;
  const depositRupees = (asset?.deposit_paise ?? 150000) / 100;
  const baseRentalSubtotal = dailyRateRupees * rentalDays;
  const gstRupees = Math.round(baseRentalSubtotal * 0.18);
  const totalRentalFee = baseRentalSubtotal + gstRupees;
  const totalPayableNow = totalRentalFee;

  async function handleConfirmAndPay() {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create tentative hold with selected rental window & Idempotency-Key
      const holdKey = getStableIdempotencyKey(
        "rental-hold",
        assetId as string,
        startDate,
        endDate,
        deliveryMode
      );
      const holdRes = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/holds/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": holdKey,
        },
        body: JSON.stringify({
          asset_id: assetId,
          start_date: startDate,
          end_date: endDate,
          quantity: 1,
          delivery_mode: deliveryMode,
        }),
      });

      if (!holdRes.ok) {
        const data = await holdRes.json().catch(() => ({}));
        const errMsg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ||
              data.error?.details?.message ||
              data.detail ||
              "Failed to create asset reservation hold. Check that this unit is available for these dates.";
        throw new Error(errMsg);
      }

      const holdData = await holdRes.json();
      const bookingId = holdData.id;

      // 2. Initiate provider payment attempts (A7_RENTAL_BOOKING + A7_DEPOSIT_HOLD)
      const payStartKey = getStableIdempotencyKey("rental-pay", bookingId);
      const payStartRes = await apiFetch(
        `${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/payment/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": payStartKey,
          },
          body: JSON.stringify({}),
        }
      );

      if (!payStartRes.ok) {
        const payData = await payStartRes.json().catch(() => ({}));
        const payErr =
          typeof payData.error === "string"
            ? payData.error
            : payData.error?.message ||
              payData.error?.details?.message ||
              payData.detail ||
              "Failed to start payment processing.";
        throw new Error(payErr);
      }

      const payData = await payStartRes.json();
      const attempts: Array<{ id: string; simulated_capture_available?: boolean }> =
        payData.payment_attempts || [];

      // 3. Simulate capture for development / fake payment provider attempts
      for (const attempt of attempts) {
        if (attempt.simulated_capture_available || process.env.NODE_ENV !== "production") {
          try {
            await apiFetch(
              `${PUBLIC_API_BASE_URL}/api/v1/payment-attempts/${attempt.id}/simulate-capture/`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
              }
            );
          } catch {
            // Simulated capture error is non-fatal here if confirm completes
          }
        }
      }

      // 4. Finalize confirmation
      const confirmRes = await apiFetch(
        `${PUBLIC_API_BASE_URL}/api/v1/rentals/bookings/${bookingId}/confirm/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!confirmRes.ok) {
        const confirmData = await confirmRes.json().catch(() => ({}));
        const confirmErr =
          typeof confirmData.error === "string"
            ? confirmData.error
            : confirmData.error?.message ||
              confirmData.error?.details?.message ||
              confirmData.detail ||
              "Payment authorization failed.";
        throw new Error(confirmErr);
      }

      // 5. Redirect to dedicated rental tracking page
      router.push(`/rentals/bookings/${bookingId}`);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 pt-8 text-navy-900">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs font-semibold text-text-muted">
          <Link href="/" className="hover:text-navy-900">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/rentals" className="hover:text-navy-900">
            Rentals
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-navy-900 font-bold">Checkout & Reserve</span>
        </nav>

        <h1 className="text-2xl sm:text-3xl font-black text-navy-900 tracking-tight">Rental Checkout</h1>
        <p className="mt-1 text-xs text-text-secondary">
          Configure delivery, review your rental schedule and refundable security deposit, and lock custody.
        </p>

        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main options column */}
          <div className="space-y-6 lg:col-span-7">
            {/* Asset summary card */}
            {asset && (
              <div className="rounded-2xl border border-line bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    <Store className="h-3.5 w-3.5" />
                    {asset.vendor_name}
                  </span>
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-text-secondary capitalize">
                    Condition: {asset.condition_grade.toLowerCase()}
                  </span>
                </div>
                <h2 className="mt-2.5 text-lg font-bold text-navy-900">{asset.title}</h2>
                <div className="mt-2 text-xs text-text-secondary">
                  Daily Rate: <strong className="text-navy-900">₹{dailyRateRupees.toLocaleString("en-IN")}</strong> • Refundable Deposit: <strong className="text-emerald-700">₹{depositRupees.toLocaleString("en-IN")}</strong>
                </div>
              </div>
            )}

            {/* Interactive Rental Window Card */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <Calendar className="h-4 w-4 text-action" /> Rental Window & Duration
                </h2>
                <span className="rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs font-bold text-action">
                  {rentalDays} {rentalDays === 1 ? "Day Duration" : "Days Duration"}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Choose the start date and return date for this equipment reservation.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl bg-neutral-50 p-4 border border-line/60">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted">
                    Rental Start Date
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value > endDate) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="mt-1.5 w-full rounded-lg border border-line bg-white p-2.5 text-xs font-bold text-navy-900 shadow-2xs focus:border-action focus:outline-hidden"
                  />
                  <span className="mt-1 block text-[10px] text-text-muted font-medium">
                    Dispatch available from 9:00 AM
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted">
                    Rental Return Date
                  </label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-line bg-white p-2.5 text-xs font-bold text-navy-900 shadow-2xs focus:border-action focus:outline-hidden"
                  />
                  <span className="mt-1 block text-[10px] text-text-muted font-medium">
                    Return collection by 7:00 PM
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery vs Storefront Pickup Option */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-2xs">
              <h2 className="text-sm font-bold text-navy-900">Fulfillment & Delivery Method</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDeliveryMode("DELIVERY")}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    deliveryMode === "DELIVERY"
                      ? "border-action bg-orange-50/40 ring-1 ring-action"
                      : "border-line bg-white hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Truck className={`h-4 w-4 ${deliveryMode === "DELIVERY" ? "text-action" : "text-text-muted"}`} />
                    <span className="text-xs font-bold text-navy-900">Direct Vendor Delivery</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary leading-relaxed">
                    Vendor delivers gear directly to your event venue or project site.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryMode("PICKUP")}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    deliveryMode === "PICKUP"
                      ? "border-action bg-orange-50/40 ring-1 ring-action"
                      : "border-line bg-white hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Store className={`h-4 w-4 ${deliveryMode === "PICKUP" ? "text-action" : "text-text-muted"}`} />
                    <span className="text-xs font-bold text-navy-900">Storefront Self-Pickup</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary leading-relaxed">
                    Pick up equipment directly from vendor&apos;s warehouse/depot.
                  </p>
                </button>
              </div>

              {deliveryMode === "DELIVERY" && (
                <div className="mt-4 rounded-xl border border-line bg-neutral-50 p-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block mb-2">
                    Delivery Address Details
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-text-secondary">Street / Venue Line</label>
                      <input
                        type="text"
                        value={deliveryAddress.line1}
                        onChange={(e) => setDeliveryAddress({ ...deliveryAddress, line1: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-line bg-white p-2 text-xs font-medium text-navy-900 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-secondary">City</label>
                      <input
                        type="text"
                        value={deliveryAddress.city}
                        onChange={(e) => setDeliveryAddress({ ...deliveryAddress, city: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-line bg-white p-2 text-xs font-medium text-navy-900 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-text-secondary">Postal Code</label>
                      <input
                        type="text"
                        value={deliveryAddress.pincode}
                        onChange={(e) => setDeliveryAddress({ ...deliveryAddress, pincode: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-line bg-white p-2 text-xs font-medium text-navy-900 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cancellation Policy Banner */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-2xs">
              <div className="flex items-center gap-2 text-sm font-bold text-navy-900">
                <RotateCcw className="h-4 w-4 text-action" />
                <span>Transparent Cancellation Policy</span>
              </div>
              <div className="mt-2.5 rounded-xl border border-line bg-[#FAF9F7] p-3.5 space-y-1.5 text-xs text-text-secondary">
                <p>
                  • <strong className="text-navy-900">Free Cancellation (≥ 24h before start):</strong> Cancel anytime at least 24 hours prior to your rental start date for a 100% full refund and immediate release of your security deposit hold.
                </p>
                <p>
                  • <strong className="text-navy-900">Late Cancellation (&lt; 24h before start):</strong> Late cancellations retain 1 day&apos;s rental fee as a compensation charge. Any remaining balance is refunded and 100% of your deposit is released.
                </p>
              </div>
            </div>

            {/* Escrow Deposit Protection Guarantee */}
            <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-xs text-blue-900">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">VSolve Escrow Deposit Protection</strong>
                <p className="mt-0.5 text-blue-800 leading-relaxed">
                  Your security deposit is held in segregated escrow. Upon clean return inspection, 100% is automatically refunded. Vendors cannot claim damages without pre-handover and post-return photo evidence.
                </p>
              </div>
            </div>
          </div>

          {/* Right Summary Column */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-2xs sticky top-6">
              <h2 className="text-sm font-bold text-navy-900">Price & Deposit Breakdown</h2>

              <div className="mt-4 space-y-3 text-xs border-b border-line pb-4">
                <div className="flex justify-between text-text-secondary">
                  <span>
                    Base Daily Rental ({rentalDays} {rentalDays === 1 ? "day" : "days"} @ ₹{dailyRateRupees.toLocaleString("en-IN")}/day)
                  </span>
                  <span className="font-semibold text-navy-900">
                    ₹{baseRentalSubtotal.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Fulfillment ({deliveryMode === "DELIVERY" ? "Vendor Dispatch" : "Self-Pickup"})</span>
                  <span className="font-semibold text-emerald-600">Included</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Applicable GST (18%)</span>
                  <span className="font-semibold text-navy-900">
                    ₹{gstRupees.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between text-navy-800 font-medium pt-1">
                  <span>Subtotal Rental Fee</span>
                  <span className="font-bold">₹{totalRentalFee.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm font-bold text-navy-900">
                <span>Rental Fee Payable Now:</span>
                <span className="text-xl font-black text-action">
                  ₹{totalPayableNow.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
                <div className="flex items-center justify-between font-bold text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    Security Deposit Hold:
                  </span>
                  <span>₹{depositRupees.toLocaleString("en-IN")}</span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-700 leading-normal">
                  Pre-authorized separately via escrow hold. 100% released upon clean return inspection.
                </p>
              </div>

              <button
                disabled={submitting || loadingAsset}
                onClick={handleConfirmAndPay}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action px-6 text-xs font-bold text-white shadow-md transition-all hover:bg-action-hover active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Locking Hold & Payment...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Confirm & Reserve Unit
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-text-muted">
                <CreditCard className="h-3.5 w-3.5" />
                <span>100% Encrypted & Escrow Protected Checkout</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
