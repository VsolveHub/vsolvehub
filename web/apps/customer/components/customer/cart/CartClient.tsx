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
import { motion, AnimatePresence, type Variants } from "framer-motion";
import type { CheckoutResult, CheckoutItemOutcome, CartItem } from "@/lib/cart/types";

const METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "cod", label: "Pay after service" },
] as const;
type MethodId = (typeof METHODS)[number]["id"];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

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
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto w-full max-w-md px-5 py-16 text-center">
        <h1 className="text-xl font-black text-gray-900 mb-2">Your cart is empty</h1>
        <p className="text-sm text-gray-500 mb-8">Add a service to get started.</p>
        <Link href="/services">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block rounded-2xl bg-[var(--color-brand)] px-6 py-4 text-sm font-bold text-white shadow-xl shadow-blue-900/20">
            Browse services
          </motion.div>
        </Link>
      </motion.div>
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
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-8">
        <button 
          onClick={() => router.push("/services")} 
          className="w-10 h-10 flex items-center justify-center bg-white border border-gray-150 rounded-2xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors shadow-sm"
        >
          ←
        </button>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Your cart</h1>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Grouped Items & Cross Selling */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="lg:col-span-2 space-y-6">
          
          {/* Savings Badge */}
          {mockSavingsAmount > 0 && (
            <motion.div variants={itemVariants} className="rounded-3xl bg-green-50 border border-green-200/50 px-6 py-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 shrink-0 flex items-center justify-center bg-green-600 text-white rounded-2xl text-lg font-black shadow-lg shadow-green-600/30">
                %
              </div>
              <div>
                <p className="text-base font-black text-green-900">Saving {formatPrice(mockSavingsAmount)} on this order</p>
                <p className="text-xs font-semibold text-green-700/80 mt-1">Yay! You are getting premium rates on these services</p>
              </div>
            </motion.div>
          )}

          {/* Grouped Services List */}
          <motion.div variants={itemVariants} className="bg-white rounded-[32px] border border-gray-150 p-6 sm:p-8 shadow-sm space-y-8">
            {Object.values(groupedItems).map((group) => {
              const qty = group.items.length;
              const totalPrice = group.items.reduce((sum, it) => sum + it.quotedAmount, 0);
              
              return (
                <div key={group.serviceId} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-8 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-brand)] bg-[var(--color-brand-light)] px-3 py-1 rounded-full">
                        {group.categorySlug}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-gray-900 mt-3 tracking-tight">
                      {group.serviceName}
                    </h3>
                    
                    {/* Selections details */}
                    {group.items[0]?.lineItems && (
                      <div className="mt-2.5 space-y-1.5">
                        {group.items[0].lineItems.map((li, idx) => (
                          <p key={idx} className="text-sm text-gray-500 font-medium">
                            • {li.value} {li.qty > 1 ? `(x${li.qty})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto shrink-0 border-t border-gray-50 pt-4 sm:border-0 sm:pt-0">
                    {/* Quantity selectors */}
                    <div className="flex items-center gap-4 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 shadow-sm">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDecrement(group)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 font-extrabold text-gray-700 shadow-sm text-base"
                      >
                        −
                      </motion.button>
                      <span className="w-6 text-center font-black text-[var(--color-brand)] text-base">{qty}</span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleIncrement(group)}
                        disabled={addToCart.isPending}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 font-extrabold text-gray-700 shadow-sm text-base disabled:opacity-50"
                      >
                        +
                      </motion.button>
                    </div>

                    <span className="text-xl font-black text-gray-900 min-w-[90px] text-right">
                      {formatPrice(totalPrice)}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>

          {/* Cross Selling Carousel */}
          {crossSellServices.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-5 pt-4">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">People also take</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {crossSellServices.map((svc) => (
                  <motion.div whileHover={{ y: -5 }} key={svc.id} className="bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-sm flex flex-col justify-between p-4 transition-all duration-300">
                    <div>
                      <div className="h-32 w-full bg-gray-50 rounded-2xl overflow-hidden mb-4 relative">
                        <ServiceSketchImage
                          slug={svc.slug}
                          subCategorySlug={svc.subCategory?.slug ?? svc.slug}
                          categorySlug={svc.category.slug}
                          serviceName={svc.name}
                          variant="card"
                          alt={svc.name}
                        />
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">
                        {svc.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500 font-bold">
                        <span className="text-[var(--color-brand-accent)]">★</span>
                        <span>4.8 (24K)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-3 border-t border-gray-50">
                      <span className="text-sm font-black text-gray-900">
                        {formatPrice(svc.pricePaise)}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addToCart.mutate({ serviceId: svc.id })}
                        disabled={addToCart.isPending}
                        className="px-4 py-2 border-2 border-[var(--color-brand)] text-[var(--color-brand)] font-black text-xs rounded-xl disabled:opacity-50"
                      >
                        Add
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </motion.div>

        {/* Right Column: Sticky Summary & Cards */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-1 space-y-6 lg:sticky lg:top-24">
          
          <div className="bg-white rounded-[32px] border border-gray-150 shadow-sm overflow-hidden">
            <h3 className="text-xs font-black uppercase text-gray-400 bg-gray-50 px-6 py-4 border-b border-gray-100 tracking-widest">
              Payment summary
            </h3>
            
            <div className="p-6 space-y-4">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-center text-sm text-gray-600 font-medium">
                  <span className="truncate pr-4">{it.serviceName}</span>
                  <span className="font-bold shrink-0">{formatPrice(it.quotedAmount)}</span>
                </div>
              ))}
              
              <div className="border-t border-gray-100 pt-4 flex justify-between items-center text-sm text-gray-500">
                <span>Platform fee</span>
                <span className="text-green-600 font-bold uppercase">Free</span>
              </div>

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center text-base">
                <span className="font-extrabold text-gray-900">Total amount</span>
                <span className="font-black text-gray-900">{formatPrice(totalAmount)}</span>
              </div>
              
              <div className="flex justify-between items-center text-lg font-black pt-2">
                <span className="text-[var(--color-brand)]">Amount to pay</span>
                <span className="text-[var(--color-brand)]">{formatPrice(totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
            <h3 className="text-base font-extrabold text-gray-900 tracking-tight">Cancellation &amp; reschedule policy</h3>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              A small fee may apply depending on the service if you cancel or reschedule after a certain time.
            </p>
            <button className="text-sm font-black text-[var(--color-brand)] hover:underline mt-3 text-left">
              Read full policy
            </button>
          </div>

          {selectedAddress ? (
            <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Service address</h3>
                <button
                  type="button"
                  onClick={() => setShowAddrPicker(true)}
                  className="text-xs font-black text-[var(--color-brand)] hover:opacity-80"
                >
                  Change
                </button>
              </div>
              
              <div className="flex items-start gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="text-red-500 shrink-0 text-xl">📍</div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{selectedAddress.label}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate leading-relaxed">{selectedAddress.fullAddress}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border-2 border-dashed border-[var(--color-brand)] p-6 text-center shadow-sm">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => setShowAddrPicker(true)}
                className="flex flex-col items-center justify-center w-full gap-3 text-center"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-2xl font-bold text-2xl">+</div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Add service address</p>
                  <p className="text-xs text-gray-500 mt-1">Please add an address to book slots</p>
                </div>
              </motion.button>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Scheduling slots</h3>
            
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0 last:pb-0">
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

          <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm space-y-5">
            {allScheduled ? (
              <>
                <div>
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Payment method</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={`rounded-xl border-2 py-3 text-xs font-black transition-all ${
                          method === m.id ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setError("");
                    checkout.mutate();
                  }}
                  disabled={checkout.isPending || updateAllAddresses.isPending}
                  className="w-full py-5 bg-[var(--color-brand)] text-white rounded-2xl text-base font-black shadow-xl shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center"
                >
                  {checkout.isPending
                    ? "Placing order…"
                    : `Proceed to pay • ${formatPrice(totalAmount)}`}
                </motion.button>
              </>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-xs text-gray-500">Please choose a date and time slot for all services to proceed.</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setShowSlotModal(true)}
                  className="w-full py-5 bg-[var(--color-brand)] text-white rounded-2xl text-base font-black shadow-xl shadow-blue-900/20"
                >
                  Select slots
                </motion.button>
              </div>
            )}
            
            <p className="text-[10px] text-center text-gray-400 mt-4 leading-relaxed">
              By proceeding, you agree to our <span className="underline cursor-pointer">T&amp;C</span>, <span className="underline cursor-pointer">Privacy</span>, and <span className="underline cursor-pointer">Cancellation Policy</span>.
            </p>
          </div>
        </motion.div>
      </div>

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
