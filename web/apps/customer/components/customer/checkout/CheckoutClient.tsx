"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import { BookSlotModal } from "@/components/customer/cart/BookSlotModal";
import { CheckoutResultView } from "@/components/customer/cart/CheckoutResultView";
import { AddressPicker } from "@/components/customer/address/AddressPicker";
import type { CheckoutResult, CheckoutItemOutcome, CartItem } from "@/lib/cart/types";

const AVAILABLE_OFFERS = [
  { code: "WELCOME50", discount: 50, isPercent: false, description: "Flat ₹50 off on your first booking" },
  { code: "VSOLVE100", discount: 100, isPercent: false, description: "Flat ₹100 off on orders above ₹500" },
  { code: "SAVER10", discount: 10, isPercent: true, description: "10% instant discount up to ₹150" },
];

export function CheckoutClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [method, setMethod] = useState<"upi" | "card" | "cod">("upi");
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ orderRef: string; items: CheckoutItemOutcome[] } | null>(null);

  // Address State
  const { data: addressData } = useQuery({ queryKey: qk.addresses(), queryFn: api.addresses });
  const addresses = addressData?.addresses ?? [];
  const [globalAddressId, setGlobalAddressId] = useState("");
  const [showAddrPicker, setShowAddrPicker] = useState(false);
  const [saveAddressForFuture, setSaveAddressForFuture] = useState(true);

  // Slots State
  const [scheduledMap, setScheduledMap] = useState<Record<string, string>>({});
  const [showSlotModal, setShowSlotModal] = useState(false);

  // Coupon State
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPaise: number } | null>(null);
  const [showOffersModal, setShowOffersModal] = useState(false);

  // Cart Data Query
  const { data, isLoading } = useQuery({ queryKey: qk.cart(), queryFn: api.cart });
  const items = data?.items ?? [];

  // Mutations
  const updateAllAddresses = useMutation({
    mutationFn: async (addrId: string) => {
      await Promise.all(items.map((it) => api.updateCartItem(it.id, { addressId: addrId })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not update address"),
  });

  const checkout = useMutation({
    mutationFn: () => api.checkoutCart(method),
    onSuccess: (res: CheckoutResult) => {
      if (res.ok) {
        setPlaced({ orderRef: res.orderRef, items: res.items });
        queryClient.invalidateQueries({ queryKey: qk.cart() });
        queryClient.invalidateQueries({ queryKey: qk.bookings() });
      } else {
        setError(res.error);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Checkout failed"),
  });

  // Synchronize scheduledMap with items loaded from cart
  useEffect(() => {
    if (items.length > 0) {
      setScheduledMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id] && item.slot) {
            const formatted =
              item.scheduleType === "instant"
                ? "Instant (Within 1 hour)"
                : `${new Date(item.slot).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`;
            next[item.id] = formatted;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [items]);

  // Default select address when loaded
  useEffect(() => {
    if (!globalAddressId && addresses.length > 0) {
      const cartAddrId = items[0]?.addressId;
      const matched = cartAddrId ? addresses.find((a) => a.id === cartAddrId) : null;
      const def = matched ?? addresses.find((a) => a.isDefault) ?? addresses[0];
      if (def) {
        setGlobalAddressId(def.id);
        if (items.length > 0 && def.id !== cartAddrId) {
          updateAllAddresses.mutate(def.id);
        }
      }
    }
  }, [addresses, globalAddressId, items]);

  const handleAddressChange = (addrId: string) => {
    setGlobalAddressId(addrId);
    if (items.length > 0) {
      updateAllAddresses.mutate(addrId);
    }
  };

  // Coupon Application Logic
  const handleApplyCoupon = (codeToApply?: string) => {
    const code = (codeToApply || couponInput).trim().toUpperCase();
    if (!code) return;

    const offer = AVAILABLE_OFFERS.find((o) => o.code === code);
    const subtotalPaise = data?.totalPaise ?? 0;

    if (!offer) {
      setError(`Invalid coupon code '${code}'`);
      return;
    }

    let discountPaise = 0;
    if (offer.isPercent) {
      discountPaise = Math.min(15000, Math.round((subtotalPaise * offer.discount) / 100));
    } else {
      discountPaise = offer.discount * 100;
    }

    setAppliedCoupon({ code: offer.code, discountPaise });
    setCouponInput("");
    setError("");
    setShowOffersModal(false);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  if (placed) return <CheckoutResultView orderRef={placed.orderRef} items={placed.items} />;
  if (isLoading) return <LoadingState label="Loading checkout…" variant="inline" />;

  // Redirect to /cart if cart is empty
  if (items.length === 0) {
    router.replace("/cart");
    return null;
  }

  const selectedAddress = addresses.find((a) => a.id === globalAddressId);
  const allScheduled = items.length > 0 && items.every((it) => scheduledMap[it.id]);
  const subtotalPaise = data?.totalPaise ?? 0;
  const discountPaise = appliedCoupon?.discountPaise ?? 0;
  const finalPayablePaise = Math.max(0, subtotalPaise - discountPaise);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/cart")}
            aria-label="Back to cart"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[#0b1c30] transition-colors hover:bg-slate-200 shrink-0 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#0b1c30]">Checkout</h1>
            <p className="text-xs text-[#45464d] font-medium mt-0.5">
              Finalize address, slots & payment
            </p>
          </div>
        </div>

        {/* Progress Stepper (Address -> Schedule -> Payment) */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                globalAddressId ? "bg-[#ea580c] text-white" : "bg-[#0b1c30] text-white"
              }`}
            >
              {globalAddressId ? "✓" : "1"}
            </div>
            <span className="text-xs font-bold text-[#0b1c30]">Address</span>
          </div>

          <div className="h-[2px] w-6 bg-slate-200" />

          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                allScheduled
                  ? "bg-[#ea580c] text-white"
                  : globalAddressId
                    ? "bg-[#0b1c30] text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {allScheduled ? "✓" : "2"}
            </div>
            <span className={`text-xs ${allScheduled || globalAddressId ? "font-bold text-[#0b1c30]" : "font-medium text-slate-400"}`}>
              Schedule
            </span>
          </div>

          <div className="h-[2px] w-6 bg-slate-200" />

          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                globalAddressId && allScheduled ? "bg-[#0b1c30] text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              3
            </div>
            <span className={`text-xs ${globalAddressId && allScheduled ? "font-bold text-[#0b1c30]" : "font-medium text-slate-400"}`}>
              Payment
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-[12px] bg-red-50 p-4 text-sm font-bold text-red-700 border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Configuration Steps */}
        <div className="lg:col-span-8 space-y-6">

          {/* Section 1: Order Summary (collapsed read-only) */}
          <div className="rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="font-heading text-lg font-bold text-[#0b1c30]">Order Summary</h2>
              <Link href="/cart" className="text-xs font-bold text-[#ea580c] hover:underline">
                Edit cart
              </Link>
            </div>
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-bold text-[#0b1c30]">{it.serviceName}</span>
                    <span className="text-xs text-[#45464d] block">
                      {it.archetypeDetails?.variantLabel || "Standard service"}
                    </span>
                  </div>
                  <span className="font-extrabold text-[#0b1c30]">{formatPrice(it.quotedAmount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Service Address */}
          <div
            className={`rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all ${
              !globalAddressId ? "border-l-4 border-l-red-500" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
                SERVICE ADDRESS
              </h2>
              <button
                type="button"
                onClick={() => setShowAddrPicker(true)}
                className="text-xs font-bold text-[#ea580c] hover:underline cursor-pointer"
              >
                {selectedAddress ? "Change" : "Add address"}
              </button>
            </div>

            {selectedAddress ? (
              <div className="flex items-start gap-3 rounded-[12px] bg-[#f8f9ff] p-4 border border-slate-200/80">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold text-xs">
                  📍
                </div>
                <div>
                  <strong className="block font-bold text-[#0b1c30] text-sm">{selectedAddress.label || "Home"}</strong>
                  <p className="text-xs text-[#45464d] mt-0.5">
                    {selectedAddress.fullAddress}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] bg-red-50/60 p-4 text-xs font-semibold text-red-700 border border-red-200 flex items-center justify-between">
                <span>Please select a service address to proceed.</span>
                <button
                  type="button"
                  onClick={() => setShowAddrPicker(true)}
                  className="rounded-full bg-red-600 px-3 py-1 text-white font-bold text-xs"
                >
                  Select Address
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="saveAddress"
                checked={saveAddressForFuture}
                onChange={(e) => setSaveAddressForFuture(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#ea580c] accent-[#ea580c]"
              />
              <label htmlFor="saveAddress" className="text-xs text-[#45464d] font-medium cursor-pointer">
                Save this address for future bookings
              </label>
            </div>
          </div>

          {/* Section 3: Scheduling Slots */}
          <div
            className={`rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all ${
              !allScheduled ? "border-l-4 border-l-amber-500" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
                SCHEDULING SLOTS
              </h2>
              <button
                type="button"
                onClick={() => setShowSlotModal(true)}
                className="text-xs font-bold text-[#ea580c] hover:underline cursor-pointer"
              >
                Edit slots
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it) => {
                const slot = scheduledMap[it.id];
                return (
                  <div key={it.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                    <span className="font-semibold text-[#0b1c30]">{it.serviceName}</span>
                    {slot ? (
                      <span className="font-bold text-emerald-700 text-xs bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        ✓ {slot}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSlotModal(true)}
                        className="font-bold text-amber-600 text-xs bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        Pending slot ⚡
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowSlotModal(true)}
              className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#ea580c] bg-[#fff7ed]/50 text-[#ea580c] hover:bg-[#fff7ed] font-bold text-xs transition-all cursor-pointer"
            >
              📅 Select date & time slots for all services
            </button>
          </div>

          {/* Section 4: Coupon / Promo Code (NEW) */}
          <div className="rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
                COUPON / PROMO CODE
              </h2>
              <button
                type="button"
                onClick={() => setShowOffersModal(true)}
                className="text-xs font-bold text-[#ea580c] hover:underline cursor-pointer"
              >
                Available offers ({AVAILABLE_OFFERS.length})
              </button>
            </div>

            {appliedCoupon ? (
              <div className="rounded-[12px] bg-[#fff7ed] p-3.5 border border-[#ffedd5] flex items-center justify-between text-xs text-[#9a3412]">
                <div>
                  <strong className="font-bold block text-sm">Coupon '{appliedCoupon.code}' applied!</strong>
                  <span>Saved {formatPrice(appliedCoupon.discountPaise)} on this booking</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="rounded-full bg-white px-3 py-1 font-bold text-red-600 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Enter promo code (e.g. WELCOME50)"
                  className="h-12 flex-1 rounded-[8px] border border-[#c6c6cd] bg-white px-4 text-sm font-semibold uppercase text-[#0b1c30] placeholder:lowercase outline-none focus:border-[#ea580c]"
                />
                <button
                  type="button"
                  onClick={() => handleApplyCoupon()}
                  className="h-12 rounded-[8px] bg-[#ea580c] hover:bg-[#c2410c] px-6 text-sm font-bold text-white transition-all cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Payment Summary */}
        <div className="lg:col-span-4">
          <div className="rounded-[16px] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)] overflow-hidden lg:sticky lg:top-6">
            {/* Deep Navy Header */}
            <div className="bg-[#0b1c30] p-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                PAYMENT SUMMARY
              </p>
              <h2 className="font-heading mt-1 text-lg font-bold text-white">Total Order Amount</h2>
            </div>

            {/* White Body */}
            <div className="p-6 bg-white space-y-4">
              <div className="space-y-2.5 text-xs sm:text-sm">
                {items.map((it) => (
                  <div key={it.id} className="flex justify-between font-medium text-[#45464d]">
                    <span>{it.serviceName}</span>
                    <strong className="font-bold text-[#0b1c30]">{formatPrice(it.quotedAmount)}</strong>
                  </div>
                ))}

                {appliedCoupon && (
                  <div className="flex justify-between font-bold text-[#ea580c]">
                    <span>Discount ('{appliedCoupon.code}')</span>
                    <span>-{formatPrice(appliedCoupon.discountPaise)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <span className="font-medium text-[#45464d]">Platform Convenience Fee</span>
                  <span className="rounded-md bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-bold text-[#ea580c]">
                    FREE / WAIVED
                  </span>
                </div>
              </div>

              <div className="my-4 border-t border-dashed border-slate-200" />

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[#45464d]">Amount to Pay</span>
                <span className="font-heading text-3xl font-extrabold text-[#ea580c]">
                  {formatPrice(finalPayablePaise)}
                </span>
              </div>

              {/* Cancellation Policy Card */}
              <div className="rounded-[12px] bg-slate-50 p-3.5 border border-slate-200 text-xs text-[#45464d] my-4">
                <strong className="block font-bold text-[#0b1c30] mb-1">
                  Cancellation & reschedule policy
                </strong>
                <span>A small fee may apply depending on the service if you cancel or reschedule after a certain time.</span>
              </div>

              {/* Dynamic CTA Button */}
              {!globalAddressId || !allScheduled ? (
                <div>
                  <p className="mb-2 text-center text-xs font-semibold text-amber-700">
                    Please choose a date and time slot for all services to proceed.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-slate-200 text-slate-500 font-bold text-sm opacity-75 cursor-not-allowed"
                  >
                    Select slots to continue
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => checkout.mutate()}
                  disabled={checkout.isPending}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  <span>{checkout.isPending ? "Processing…" : `Pay ${formatPrice(finalPayablePaise)}`}</span>
                  <span>→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Address Picker Modal */}
      {showAddrPicker && (
        <AddressPicker
          open={showAddrPicker}
          onClose={() => setShowAddrPicker(false)}
          onSelected={(addr) => {
            handleAddressChange(addr.id);
            setShowAddrPicker(false);
          }}
        />
      )}

      {/* Book Slot Modal */}
      {showSlotModal && (
        <BookSlotModal
          open={showSlotModal}
          items={items}
          scheduledMap={scheduledMap}
          setScheduledMap={setScheduledMap}
          onClose={() => setShowSlotModal(false)}
          onSuccess={() => setShowSlotModal(false)}
        />
      )}

      {/* Available Offers Modal */}
      {showOffersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[16px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-bold text-[#0b1c30]">Available Offers</h3>
              <button type="button" onClick={() => setShowOffersModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="space-y-3">
              {AVAILABLE_OFFERS.map((offer) => (
                <div key={offer.code} className="rounded-[12px] border border-slate-200 p-4 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#ea580c] text-sm block">{offer.code}</span>
                    <span className="text-xs text-[#45464d]">{offer.description}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyCoupon(offer.code)}
                    className="rounded-full bg-[#ea580c] px-3 py-1 text-xs font-bold text-white hover:bg-[#c2410c]"
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
