"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import { BookSlotModal } from "./BookSlotModal";
import { CheckoutResultView } from "./CheckoutResultView";
import { AddressPicker } from "@/components/customer/address/AddressPicker";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import type { CheckoutResult, CheckoutItemOutcome, CartItem } from "@/lib/cart/types";

const METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "cod", label: "Pay after service" },
] as const;
type MethodId = (typeof METHODS)[number]["id"];

export function CartClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<MethodId>("upi");
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ orderRef: string; items: CheckoutItemOutcome[] } | null>(null);

  // Address State
  const { data: addressData } = useQuery({ queryKey: qk.addresses(), queryFn: api.addresses });
  const addresses = addressData?.addresses ?? [];
  const [globalAddressId, setGlobalAddressId] = useState("");
  const [showAddrPicker, setShowAddrPicker] = useState(false);

  // Slots State
  const [scheduledMap, setScheduledMap] = useState<Record<string, string>>({});
  const [showSlotModal, setShowSlotModal] = useState(false);

  // Cart and Catalog Queries
  const { data, isLoading } = useQuery({ queryKey: qk.cart(), queryFn: api.cart });
  const items = data?.items ?? [];

  const { data: catalogData } = useQuery({ 
    queryKey: ["catalog"], 
    queryFn: api.catalog, 
    staleTime: 5 * 60_000 
  });
  const catalogServices = catalogData?.services ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.removeCartItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.cart() }),
  });

  const addToCart = useMutation({
    mutationFn: (input: { serviceId: string; selections?: any; archetypeDetails?: any }) =>
      api.addToCart({
        serviceId: input.serviceId,
        selections: input.selections,
        archetypeDetails: input.archetypeDetails,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add item"),
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

  const updateAllAddresses = useMutation({
    mutationFn: async (addrId: string) => {
      await Promise.all(items.map((it) => api.updateCartItem(it.id, { addressId: addrId })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not update address"),
  });

  // Default-select default or first address when loaded
  useEffect(() => {
    if (!globalAddressId && addresses.length > 0) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (def) {
        setGlobalAddressId(def.id);
        if (items.length > 0) {
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

  // Group items by serviceId to support quantity counter UI
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.serviceId]) {
      acc[item.serviceId] = {
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        serviceSlug: item.serviceSlug,
        categorySlug: item.categorySlug,
        price: item.quotedAmount,
        items: [],
      };
    }
    acc[item.serviceId].items.push(item);
    return acc;
  }, {} as Record<string, { serviceId: string; serviceName: string; serviceSlug: string; categorySlug: string; price: number; items: CartItem[] }>);

  const handleIncrement = (group: any) => {
    const first = group.items[0];
    addToCart.mutate({
      serviceId: group.serviceId,
      selections: first.archetypeDetails?.fieldValues,
      archetypeDetails: first.archetypeDetails,
    });
  };

  const handleDecrement = (group: any) => {
    const lastItem = group.items[group.items.length - 1];
    if (lastItem) {
      // Remove slot mapping
      const updatedMap = { ...scheduledMap };
      delete updatedMap[lastItem.id];
      setScheduledMap(updatedMap);
      
      remove.mutate(lastItem.id);
    }
  };

  if (placed) return <CheckoutResultView orderRef={placed.orderRef} items={placed.items} />;
  if (isLoading) return <LoadingState label="Loading your cart…" variant="inline" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 text-center">
        <h1 className="text-lg font-black text-gray-900 animate-fade-in">Your cart is empty</h1>
        <p className="mt-1 text-sm text-gray-500">Add a service to get started.</p>
        <Link href="/services" className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-md shadow-brand/10 hover:opacity-90 transition-all">
          Browse services
        </Link>
      </div>
    );
  }

  const selectedAddress = addresses.find((a) => a.id === globalAddressId);
  const allScheduled = items.every((it) => scheduledMap[it.id]);

  // Compute mock savings (e.g. 8% of total price)
  const totalAmount = data?.totalPaise ?? 0;
  const mockSavingsAmount = Math.round(totalAmount * 0.08 / 100) * 100;

  // Filter catalogServices for cross-selling (exclude items already in cart)
  const inCartSlugs = new Set(items.map((it) => it.serviceSlug));
  const crossSellServices = catalogServices
    .filter((s) => !inCartSlugs.has(s.slug))
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Back to services header */}
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => router.push("/services")} 
          className="w-10 h-10 flex items-center justify-center bg-white border border-gray-150 rounded-xl text-gray-600 hover:text-gray-900 transition-colors shadow-sm"
        >
          ←
        </button>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Your cart</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 animate-in fade-in">
          {error}
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Grouped Items & Cross Selling */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Savings Badge */}
          {mockSavingsAmount > 0 && (
            <div className="rounded-2xl bg-green-50 border border-green-200/50 px-5 py-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-9 h-9 shrink-0 flex items-center justify-center bg-green-600 text-white rounded-xl text-xs font-black shadow-md shadow-green-150">
                %
              </div>
              <div>
                <p className="text-sm font-black text-green-900">Saving {formatPrice(mockSavingsAmount)} on this order</p>
                <p className="text-[11px] text-green-700/80 mt-0.5">Yay! You are getting premium rates on these services</p>
              </div>
            </div>
          )}

          {/* Grouped Services List */}
          <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm space-y-6">
            {Object.values(groupedItems).map((group) => {
              const qty = group.items.length;
              const totalPrice = group.items.reduce((sum, it) => sum + it.quotedAmount, 0);
              
              return (
                <div key={group.serviceId} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider text-brand bg-brand-light px-2.5 py-0.5 rounded-full">
                        {group.categorySlug}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-gray-900 mt-2 tracking-tight">
                      {group.serviceName}
                    </h3>
                    
                    {/* Selections details */}
                    {group.items[0]?.lineItems && (
                      <div className="mt-2 space-y-1">
                        {group.items[0].lineItems.map((li, idx) => (
                          <p key={idx} className="text-xs text-gray-400 font-medium">
                            • {li.value} {li.qty > 1 ? `(x${li.qty})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto shrink-0 border-t border-gray-50 pt-3 sm:border-0 sm:pt-0">
                    {/* Quantity selectors */}
                    <div className="flex items-center gap-3.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 shadow-sm">
                      <button
                        onClick={() => handleDecrement(group)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 font-extrabold text-gray-700 hover:bg-gray-100 transition shadow-sm text-sm"
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-black text-brand text-sm">{qty}</span>
                      <button
                        onClick={() => handleIncrement(group)}
                        disabled={addToCart.isPending}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 font-extrabold text-gray-700 hover:bg-gray-100 transition shadow-sm text-sm disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>

                    <span className="text-base font-black text-gray-900 min-w-[80px] text-right">
                      {formatPrice(totalPrice)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cross Selling Carousel: "People also take" */}
          {crossSellServices.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">People also take</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {crossSellServices.map((svc) => (
                  <div key={svc.id} className="bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm flex flex-col justify-between p-3.5 hover:shadow-md transition-shadow">
                    <div>
                      {/* Image placeholder sketch */}
                      <div className="h-28 w-full bg-gray-50 rounded-xl overflow-hidden mb-3 relative">
                        <ServiceSketchImage
                          slug={svc.slug}
                          subCategorySlug={svc.subCategory?.slug ?? svc.slug}
                          categorySlug={svc.category.slug}
                          serviceName={svc.name}
                          variant="card"
                          alt={svc.name}
                        />
                      </div>
                      <h4 className="text-xs font-black text-gray-900 line-clamp-2 leading-tight">
                        {svc.name}
                      </h4>
                      
                      {/* Mock rating stars */}
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500 font-bold">
                        <span className="text-brand-accent">★</span>
                        <span>4.8 (24K)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-2 border-t border-gray-50">
                      <span className="text-xs font-black text-gray-900">
                        {formatPrice(svc.pricePaise)}
                      </span>
                      <button
                        onClick={() => addToCart.mutate({ serviceId: svc.id })}
                        disabled={addToCart.isPending}
                        className="px-3 py-1.5 border border-brand text-brand hover:bg-brand-light font-black text-[10px] rounded-xl transition-colors disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Sticky Summary & Cards */}
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-6">
          
          {/* Payment Summary */}
          <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden">
            <h3 className="text-xs font-black uppercase text-gray-400 bg-gray-50 px-5 py-3 border-b border-gray-100 tracking-wider">
              Payment summary
            </h3>
            
            <div className="p-5 space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-center text-xs text-gray-600 font-medium">
                  <span className="truncate pr-4">{it.serviceName}</span>
                  <span className="font-bold shrink-0">{formatPrice(it.quotedAmount)}</span>
                </div>
              ))}
              
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-xs text-gray-500">
                <span>Platform fee</span>
                <span className="text-green-600 font-bold uppercase">Free</span>
              </div>

              <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-sm">
                <span className="font-extrabold text-gray-900">Total amount</span>
                <span className="font-black text-gray-900">{formatPrice(totalAmount)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm font-black pt-1">
                <span className="text-brand">Amount to pay</span>
                <span className="text-brand">{formatPrice(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Policy Information */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">Cancellation &amp; reschedule policy</h3>
            <p className="text-[11px] text-gray-500 mt-1 leading-normal">
              A small fee may apply depending on the service if you cancel or reschedule after a certain time.
            </p>
            <button className="text-xs font-black text-brand hover:underline mt-2 text-left">
              Read full policy
            </button>
          </div>

          {/* Global Address Selector */}
          {selectedAddress ? (
            <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Service address</h3>
                <button
                  type="button"
                  onClick={() => setShowAddrPicker(true)}
                  className="text-xs font-black text-brand hover:opacity-80"
                >
                  Change
                </button>
              </div>
              
              <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <div className="text-red-500 shrink-0 mt-0.5">📍</div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900">{selectedAddress.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate leading-tight">{selectedAddress.fullAddress}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-brand p-5 text-center shadow-sm">
              <button
                type="button"
                onClick={() => setShowAddrPicker(true)}
                className="flex flex-col items-center justify-center w-full gap-2 text-center"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-brand-light text-brand rounded-xl font-bold text-lg">+</div>
                <div>
                  <p className="text-xs font-bold text-gray-900">Add service address</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Please add an address to book slots</p>
                </div>
              </button>
            </div>
          )}

          {/* Slots Configuration State */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Scheduling slots</h3>
            
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-50 last:border-0 last:pb-0">
                  <span className="truncate pr-4 text-gray-600 font-semibold">{it.serviceName}</span>
                  {scheduledMap[it.id] ? (
                    <span className="text-green-700 font-bold shrink-0">{scheduledMap[it.id]}</span>
                  ) : (
                    <span className="text-red-500 font-black shrink-0 animate-pulse">Pending slot</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Checkout Checkout CTA Box */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm space-y-4">
            {allScheduled ? (
              <>
                <div>
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Payment method</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={`rounded-xl border py-2 text-[10px] font-black transition-all ${
                          method === m.id ? "border-brand bg-blue-50/50 text-brand" : "border-gray-200 text-gray-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    checkout.mutate();
                  }}
                  disabled={checkout.isPending || updateAllAddresses.isPending}
                  className="w-full py-4 bg-brand hover:opacity-95 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-brand/10 disabled:opacity-50 cursor-pointer"
                >
                  {checkout.isPending
                    ? "Placing order…"
                    : `Proceed to pay • ${formatPrice(totalAmount)}`}
                </button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-[11px] text-gray-500">Please choose a date and time slot for all services to proceed.</p>
                <button
                  type="button"
                  onClick={() => setShowSlotModal(true)}
                  className="w-full py-4 bg-brand text-white rounded-2xl text-sm font-black hover:opacity-95 transition-all shadow-lg shadow-brand/10 cursor-pointer"
                >
                  Select slots
                </button>
              </div>
            )}
            
            <p className="text-[9px] text-center text-gray-400 mt-2 leading-relaxed">
              By proceeding, you agree to our <span className="underline cursor-pointer">T&amp;C</span>, <span className="underline cursor-pointer">Privacy</span>, and <span className="underline cursor-pointer">Cancellation Policy</span>.
            </p>
          </div>

        </div>

      </div>

      {/* Pop-up Modals */}
      <BookSlotModal
        open={showSlotModal}
        items={items}
        onClose={() => setShowSlotModal(false)}
        onSuccess={() => setShowSlotModal(false)}
        scheduledMap={scheduledMap}
        setScheduledMap={setScheduledMap}
      />

      <AddressPicker
        open={showAddrPicker}
        redirectAfterLogin="/cart"
        onClose={() => setShowAddrPicker(false)}
        onSelected={(a) => handleAddressChange(a.id)}
      />
    </div>
  );
}
