"use client";

// Marketplace cart + delivery checkout. Separate from the service cart on
// purpose: services dispatch to a technician, products ship to an address.
// Money still funds through the same Order envelope server-side.

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PaymentMethod } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "cod", label: "Cash on delivery" },
];

export function StoreCartClient() {
  const queryClient = useQueryClient();
  const [addressId, setAddressId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [placed, setPlaced] = useState<string | null>(null);

  const { data: cart, isLoading } = useQuery({ queryKey: qk.storeCart(), queryFn: api.storeCart });
  const { data: addressData } = useQuery({ queryKey: qk.addresses(), queryFn: api.addresses });
  const addresses = addressData?.addresses ?? [];
  const selectedAddress = addressId || addresses.find((a) => a.isDefault)?.id || addresses[0]?.id || "";

  const updateLine = useMutation({
    mutationFn: ({ lineId, qty }: { lineId: string; qty: number }) => api.updateStoreCartLine(lineId, qty),
    onSuccess: (next) => queryClient.setQueryData(qk.storeCart(), next),
  });

  const checkout = useMutation({
    mutationFn: () => api.checkoutStoreCart({ addressId: selectedAddress, paymentMethod: method }),
    onSuccess: (res) => {
      if (res.ok && res.orderRef) {
        setPlaced(res.orderRef);
        queryClient.invalidateQueries({ queryKey: qk.storeCart() });
        queryClient.invalidateQueries({ queryKey: qk.storeOrders() });
      }
    },
  });

  if (placed) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
        <h1 className="mt-4 text-xl font-black text-gray-900">Order placed!</h1>
        <p className="mt-1 text-sm text-gray-500">
          Order <span className="font-bold text-gray-800">{placed}</span> is confirmed. We&apos;ll pack it and get it
          to your door.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/store/orders" className="rounded-2xl bg-[var(--color-brand)] py-3 text-sm font-black text-white">
            Track my order
          </Link>
          <Link href="/store" className="rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-600">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <p className="mt-16 text-center text-sm text-gray-400">Loading cart…</p>;

  const items = cart?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <p className="text-4xl">🛒</p>
        <h1 className="mt-3 text-lg font-black text-gray-900">Your store cart is empty</h1>
        <p className="mt-1 text-sm text-gray-500">Browse the store and add products to get started.</p>
        <Link
          href="/store"
          className="mt-5 inline-block rounded-2xl bg-[var(--color-brand)] px-6 py-3 text-sm font-black text-white"
        >
          Browse store
        </Link>
      </div>
    );
  }

  const checkoutError =
    (checkout.data && !checkout.data.ok ? checkout.data.error : "") ||
    (checkout.error instanceof Error ? checkout.error.message : "");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <Link href="/store" className="text-sm font-bold text-gray-500 hover:text-gray-800">
        ‹ Store
      </Link>
      <h1 className="mt-2 text-xl font-black text-gray-900">Store cart</h1>

      <div className="mt-4 space-y-2.5">
        {items.map((line) => (
          <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">{line.product.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatPrice(line.unitPricePaise)} each · GST incl.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-gray-200 px-2 py-1">
                <button
                  onClick={() => updateLine.mutate({ lineId: line.id, qty: line.qty - 1 })}
                  disabled={updateLine.isPending}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-extrabold text-gray-700"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-black text-[var(--color-brand)]">{line.qty}</span>
                <button
                  onClick={() => updateLine.mutate({ lineId: line.id, qty: line.qty + 1 })}
                  disabled={updateLine.isPending}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-extrabold text-gray-700"
                >
                  +
                </button>
              </div>
              <span className="w-20 text-right text-sm font-black text-gray-900">{formatPrice(line.totalPaise)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Delivery address */}
      <h2 className="mt-6 text-[0.8rem] font-bold tracking-[0.05em] text-gray-600">DELIVER TO</h2>
      {addresses.length === 0 ? (
        <Link
          href="/profile/addresses"
          className="mt-2 block rounded-2xl border-2 border-dashed border-gray-200 p-4 text-center text-sm font-bold text-[var(--color-brand)]"
        >
          + Add a delivery address
        </Link>
      ) : (
        <div className="mt-2 space-y-2">
          {addresses.map((a) => (
            <button
              key={a.id}
              onClick={() => setAddressId(a.id)}
              className={`block w-full rounded-2xl border p-3.5 text-left text-sm transition-colors ${
                selectedAddress === a.id
                  ? "border-[var(--color-brand)] bg-blue-50/40"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="font-bold text-gray-900">{a.label}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{a.fullAddress}</span>
            </button>
          ))}
        </div>
      )}

      {/* Payment */}
      <h2 className="mt-6 text-[0.8rem] font-bold tracking-[0.05em] text-gray-600">PAYMENT</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAYMENT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMethod(opt.value)}
            className={`rounded-xl border py-2.5 text-xs font-bold transition-colors ${
              method === opt.value
                ? "border-[var(--color-brand)] bg-blue-50/50 text-[var(--color-brand)]"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Items total (GST incl.)</span>
          <span className="font-bold text-gray-900">{formatPrice(cart?.totalPaise ?? 0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Delivery</span>
          <span className="font-bold text-green-600">FREE</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-base">
          <span className="font-black text-gray-900">To pay</span>
          <span className="font-black text-gray-900">{formatPrice(cart?.totalPaise ?? 0)}</span>
        </div>
      </div>

      {checkoutError ? <p className="mt-3 text-center text-sm font-semibold text-red-500">{checkoutError}</p> : null}

      <button
        onClick={() => checkout.mutate()}
        disabled={!selectedAddress || checkout.isPending}
        className="mt-4 w-full rounded-2xl bg-[var(--color-brand)] py-3.5 text-base font-black text-white transition-colors hover:bg-blue-900 disabled:opacity-50"
      >
        {checkout.isPending ? "Placing order…" : `Place order · ${formatPrice(cart?.totalPaise ?? 0)}`}
      </button>
    </div>
  );
}
