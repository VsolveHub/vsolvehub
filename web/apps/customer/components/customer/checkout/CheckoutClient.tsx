"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { BookSlotModal } from "@/components/customer/cart/BookSlotModal";
import { CheckoutResultView } from "@/components/customer/cart/CheckoutResultView";
import { AddressPicker } from "@/components/customer/address/AddressPicker";
import type { CheckoutResult, CheckoutItemOutcome, CartItem } from "@/lib/cart/types";

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

  // Cart Data Query
  const { data, isLoading } = useQuery({ queryKey: qk.cart(), queryFn: api.cart });
  const items = data?.items ?? [];

  // Mutations
  const updateAllAddresses = useMutation({
    mutationFn: async (addrId: string) => {
      await Promise.all(items.map((it) => api.updateCartItem(it.id, { addressId: addrId, slotConfirmed: false })));
    },
    onSuccess: () => {
      setScheduledMap({});
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

  // Synchronize scheduledMap only with slots explicitly saved by the customer.
  useEffect(() => {
    if (items.length > 0) {
      setScheduledMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id] && item.slotConfirmed && item.slot) {
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
        for (const id of Object.keys(next)) {
          if (!items.some((item) => item.id === id)) {
            delete next[id];
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
  const finalPayablePaise = subtotalPaise;
  const serviceSubtotalPaise = items.reduce((sum, item) => sum + item.baseChargePaise, 0);
  const platformFeePaise = items.reduce((sum, item) => sum + item.platformFeePaise, 0);
  const platformFeeGstPaise = items.reduce((sum, item) => sum + item.taxPaise, 0);
  const addOnsPaise = Math.max(
    0,
    subtotalPaise - serviceSubtotalPaise - platformFeePaise - platformFeeGstPaise,
  );

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
                <div key={it.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-bold text-[#0b1c30]">{it.serviceName}</span>
                      <span className="text-xs text-[#45464d] block">
                        {it.archetypeDetails?.variantLabel || "Standard service"}
                      </span>
                    </div>
                    <span className="font-extrabold text-[#0b1c30]">{formatPrice(it.quotedAmount)}</span>
                  </div>
                  {it.lineItems && it.lineItems.length > 0 && (
                    <div className="mt-2 pl-3 border-l-2 border-[#ea580c]/30 space-y-1">
                      <span className="text-[10px] font-bold text-[#ea580c] uppercase tracking-wide block">Included Parts &amp; Add-ons:</span>
                      {it.lineItems.map((li, idx) => (
                        <div key={`${li.key}-${idx}`} className="flex items-center justify-between text-xs text-slate-700 font-medium">
                          <span>📦 {li.value} {li.qty > 1 ? `× ${li.qty}` : ""}</span>
                          <span className="font-bold text-[#0b1c30]">{formatPrice(li.totalPaise)}</span>
                        </div>
                      ))}
                    </div>
                  )}
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

          {items.length === 1 ? (
            <div
              className={`rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all ${
                !allScheduled ? "border-l-4 border-l-amber-500" : ""
              }`}
            >
              <div className="mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
                  SCHEDULING SLOTS
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Book a slot for this service before payment.
                </p>
              </div>
              <BookSlotModal
                open
                embedded
                items={items}
                scheduledMap={scheduledMap}
                setScheduledMap={setScheduledMap}
                onClose={() => undefined}
                onSuccess={() => undefined}
              />
            </div>
          ) : null}

          {/* Section 3: Scheduling Slots */}
          <div
            className={`${items.length === 1 ? "hidden" : ""} rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all ${
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
              PAYMENT METHOD
            </h2>
            <p className="mt-1 text-sm text-slate-500">Choose how you want to pay for this order.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { id: "upi" as const, label: "UPI", detail: "Any UPI app" },
                { id: "card" as const, label: "Card", detail: "Credit or debit" },
                { id: "cod" as const, label: "Pay after service", detail: "Cash / on-site" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMethod(option.id)}
                  className={`min-h-[76px] cursor-pointer rounded-xl border p-4 text-left transition ${
                    method === option.id
                      ? "border-[#ea580c] bg-[#fff7ed] ring-2 ring-orange-100"
                      : "border-slate-200 hover:border-blue-200"
                  }`}
                >
                  <span className="block text-sm font-black text-[#0b1c30]">{option.label}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{option.detail}</span>
                </button>
              ))}
            </div>
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
                <div className="flex justify-between font-medium text-[#45464d]">
                  <span>Service charges</span>
                  <strong className="font-bold text-[#0b1c30]">{formatPrice(serviceSubtotalPaise)}</strong>
                </div>
                {addOnsPaise > 0 ? (
                  <div className="flex justify-between font-medium text-[#45464d]">
                    <span>Parts & add-ons</span>
                    <strong className="font-bold text-[#0b1c30]">{formatPrice(addOnsPaise)}</strong>
                  </div>
                ) : null}

                <div className="flex justify-between items-center pt-1">
                  <span className="font-medium text-[#45464d]">Platform convenience fee</span>
                  <strong className="font-bold text-[#0b1c30]">{formatPrice(platformFeePaise)}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-[#45464d]">GST on platform fee (18%)</span>
                  <strong className="font-bold text-[#0b1c30]">{formatPrice(platformFeeGstPaise)}</strong>
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

    </div>
  );
}
