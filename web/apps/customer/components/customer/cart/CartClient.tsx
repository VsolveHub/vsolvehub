"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import { motion } from "framer-motion";
import type { CartItem } from "@/lib/cart/types";

export function CartClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  // Cart Query
  const { data, isLoading } = useQuery({ queryKey: qk.cart(), queryFn: api.cart });
  const items = data?.items ?? [];

  // Catalog Query for Cross-Selling
  const { data: catalogData } = useQuery({
    queryKey: ["catalog"],
    queryFn: api.catalog,
    staleTime: 5 * 60_000,
  });
  const catalogServices = catalogData?.services ?? [];

  // Mutations
  const remove = useMutation({
    mutationFn: (id: string) => api.removeCartItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      queryClient.invalidateQueries({ queryKey: qk.cartCount() });
    },
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
      queryClient.invalidateQueries({ queryKey: qk.cartCount() });
      setError("");
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Could not add item";
      if (msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("login")) {
        router.push("/booking/otp?redirect=/cart");
        return;
      }
      setError(msg);
    },
  });

  // Group items by serviceId to support quantity counter UI
  const groupedItems = useMemo(() => {
    return items.reduce((acc, item) => {
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
  }, [items]);

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
      remove.mutate(lastItem.id);
    }
  };

  const handleRemoveGroup = (group: any) => {
    group.items.forEach((it: CartItem) => {
      remove.mutate(it.id);
    });
  };

  if (isLoading) return <LoadingState label="Loading your cart…" variant="inline" />;

  // Empty State
  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#fff7ed] text-[#ea580c]">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h1 className="font-heading text-2xl font-bold text-[#0b1c30] mb-2">Your cart is empty</h1>
        <p className="text-sm text-[#45464d] mb-8">Add a service to get started with your booking.</p>
        <Link href="/services">
          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#ea580c] hover:bg-[#c2410c] px-8 text-sm font-bold text-white shadow-md transition-all cursor-pointer"
          >
            Browse services
          </button>
        </Link>
      </div>
    );
  }

  // Savings computation
  const totalAmount = data?.totalPaise ?? 0;

  // Cross-sell services filter
  const inCartSlugs = new Set(items.map((it) => it.serviceSlug));
  const crossSellServices = catalogServices
    .filter((s) => !inCartSlugs.has(s.slug))
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[#0b1c30] transition-colors hover:bg-slate-200 shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#0b1c30]">Your cart</h1>
          <p className="text-xs text-[#45464d] font-medium mt-0.5">
            {items.length} {items.length === 1 ? "item" : "items"} selected
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-[12px] bg-red-50 p-4 text-sm font-bold text-red-700 border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Cart Items + Recommendations */}
        <div className="lg:col-span-8 space-y-6">

          {/* Cart Items List */}
          <div className="rounded-[16px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] divide-y divide-slate-100">
            {Object.values(groupedItems).map((group) => {
              const count = group.items.length;
              const categoryTag = (group.categorySlug || "SERVICE").toUpperCase();

              return (
                <div key={group.serviceId} className="py-5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="inline-block rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#ea580c] uppercase">
                      {categoryTag}
                    </span>
                    <h3 className="font-heading text-base font-black text-black">
                      {group.serviceName}
                    </h3>
                    <p className="text-xs text-[#45464d] font-medium">
                      • {group.items[0]?.archetypeDetails?.variantLabel || "Standard service"}
                    </p>
                    {/* Itemized Parts & Add-ons list */}
                    {group.items.some((it) => it.lineItems && it.lineItems.length > 0) && (
                      <div className="mt-2 pl-2 border-l-2 border-[#ea580c]/30 space-y-1">
                        <span className="text-[10px] font-bold text-[#ea580c] uppercase tracking-wide block">Included Parts &amp; Add-ons:</span>
                        {group.items.flatMap((it) => it.lineItems || []).map((li, idx) => (
                          <div key={`${li.key}-${idx}`} className="flex items-center justify-between text-xs text-slate-700 font-medium gap-4">
                            <span>📦 {li.value} {li.qty > 1 ? `× ${li.qty}` : ""}</span>
                            <span className="font-bold text-[#0b1c30]">{formatPrice(li.totalPaise)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    {/* Stepper + Remove Trash Button */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveGroup(group)}
                        title="Remove service from cart"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleDecrement(group)}
                          aria-label="Decrease quantity"
                          className="h-6 w-6 rounded-full bg-slate-100 text-[#0b1c30] hover:bg-slate-200 transition-colors font-bold text-sm flex items-center justify-center cursor-pointer"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-bold text-[#0b1c30]">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIncrement(group)}
                          aria-label="Increase quantity"
                          className="h-6 w-6 rounded-full bg-slate-100 text-[#0b1c30] hover:bg-slate-200 transition-colors font-bold text-sm flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Price */}
                    <span className="font-heading text-lg font-extrabold text-[#0b1c30]">
                      {formatPrice(group.price * count)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* "People also take" Recommendation Carousel */}
          {crossSellServices.length > 0 && (
            <div className="pt-4">
              <h2 className="font-heading text-lg font-bold text-[#0b1c30] mb-4">
                People also take
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {crossSellServices.map((srv) => (
                  <div
                    key={srv.id}
                    className="rounded-[16px] bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.08)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative mb-3 h-28 w-full flex items-center justify-center overflow-hidden rounded-[12px] bg-slate-100 p-2">
                        <ServiceSketchImage slug={srv.slug} alt={srv.name} size={112} className="object-contain max-h-full" />
                      </div>
                      <h4 className="font-bold text-xs sm:text-sm text-[#0b1c30] line-clamp-1">
                        {srv.name}
                      </h4>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-[#45464d]">
                        <span className="text-amber-500">★</span>
                        <span>4.8 (24K)</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="font-bold text-xs sm:text-sm text-[#0b1c30]">
                        {formatPrice(srv.pricePaise)}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart.mutate({ serviceId: srv.id })}
                        disabled={addToCart.isPending}
                        className="rounded-full border border-[#ea580c] text-[#ea580c] hover:bg-[#ea580c] hover:text-white px-3 py-1 text-xs font-bold transition-all cursor-pointer"
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

        {/* Right Column: Detailed Cart Summary & Proceed to Checkout */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl bg-white p-6 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] lg:sticky lg:top-24 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#0b1c30]">
                DETAILED CART SUMMARY
              </h2>
              <span className="rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[10px] font-extrabold text-[#ea580c] border border-[#ffedd5]">
                {items.length} {items.length === 1 ? "Item" : "Items"}
              </span>
            </div>

            {/* Detailed Itemized Line Items List */}
            <div className="space-y-3 text-xs sm:text-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                SELECTED SERVICES
              </span>
              {Object.values(groupedItems).map((group) => (
                <div key={group.serviceId} className="flex items-start justify-between gap-2 pb-2 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-black text-black text-sm truncate">{group.serviceName}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Qty: {group.items.length} • {group.items[0]?.archetypeDetails?.variantLabel || "Standard service"}
                    </p>
                  </div>
                  <strong className="font-extrabold text-[#0b1c30] shrink-0">
                    {formatPrice(group.price * group.items.length)}
                  </strong>
                </div>
              ))}
            </div>

            {/* Detailed Fee Breakdown */}
            <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs sm:text-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                FEE BREAKDOWN
              </span>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Items Base Total</span>
                <span className="font-bold text-[#0b1c30]">{formatPrice(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 font-medium">
                <span>Platform Convenience Fee</span>
                <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-[10px] font-bold text-[#ea580c]">
                  WAIVED
                </span>
              </div>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Taxes &amp; GST</span>
                <span className="font-bold text-emerald-600">INCLUDED</span>
              </div>
            </div>

            <div className="my-3 border-t border-dashed border-slate-200" />

            {/* Total Payable Box */}
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Total Payable</span>
              </div>
              <span className="font-heading text-2xl sm:text-3xl font-black text-[#0b1c30]">
                {formatPrice(totalAmount)}
              </span>
            </div>

            {/* Checkout CTA */}
            <button
              type="button"
              onClick={() => router.push("/checkout")}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white font-black text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer"
            >
              <span>Proceed to Checkout</span>
              <span>→</span>
            </button>

            {/* Trust Badges */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-500 font-medium">
              <div className="flex items-center gap-2">
                <span className="text-[#ea580c]">🛡️</span>
                <span>30-Day VSolve Service Warranty</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600">⚡</span>
                <span>Verified Professional Assigned Instantly</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
