"use client";

// Marketplace browse page. Same Product table as the booking add-ons — no
// duplicated catalog anywhere.

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { useSessionQuery } from "@/lib/query/hooks";
import { useRouter } from "next/navigation";

export function StoreClient() {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: sessionData } = useSessionQuery();
  const loggedIn = !!sessionData?.user;

  const { data, isLoading } = useQuery({
    queryKey: qk.storeProducts(category, q),
    queryFn: () => api.storeProducts({ category, q }),
    staleTime: 60_000,
  });

  const { data: cart } = useQuery({
    queryKey: qk.storeCart(),
    queryFn: api.storeCart,
    enabled: loggedIn,
    staleTime: 15_000,
  });
  const cartCount = cart?.items.reduce((s, i) => s + i.qty, 0) ?? 0;

  const addMutation = useMutation({
    mutationFn: (productId: string) => api.addToStoreCart(productId, 1),
    onSuccess: (next) => queryClient.setQueryData(qk.storeCart(), next),
  });

  const add = (productId: string) => {
    if (!loggedIn) {
      router.push("/booking/otp?redirect=/store");
      return;
    }
    addMutation.mutate(productId);
  };

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Store</h1>
          <p className="mt-0.5 text-sm text-gray-500">Genuine parts &amp; supplies at platform prices, delivered.</p>
        </div>
        <Link
          href="/store/orders"
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:border-gray-300"
        >
          My orders
        </Link>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search switches, taps, filters…"
        className="mt-4 h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory("")}
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${
            !category ? "bg-[var(--color-brand)] text-white" : "border border-gray-200 bg-white text-gray-600"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            onClick={() => setCategory(c.slug === category ? "" : c.slug)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${
              category === c.slug ? "bg-[var(--color-brand)] text-white" : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-10 text-center text-sm text-gray-400">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-400">No products match your search.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <Link href={`/store/${p.slug}`} className="flex-1">
                <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50 text-3xl">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt={p.name} className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <span>📦</span>
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 text-[0.85rem] font-bold leading-snug text-gray-900">{p.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-gray-400">{p.brandName ?? p.categoryName}</p>
                <p className="mt-1 text-sm">
                  <span className="font-black text-gray-900">{formatPrice(p.pricePaise)}</span>
                  {p.mrpPaise > p.pricePaise ? (
                    <span className="ml-1.5 text-xs text-gray-400 line-through">{formatPrice(p.mrpPaise)}</span>
                  ) : null}
                </p>
              </Link>
              <button
                onClick={() => add(p.id)}
                disabled={!p.inStock || addMutation.isPending}
                className="mt-2.5 rounded-xl border-2 border-[var(--color-brand)] py-1.5 text-xs font-black text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {p.inStock ? "Add to cart" : "Out of stock"}
              </button>
            </div>
          ))}
        </div>
      )}

      {cartCount > 0 ? (
        <Link
          href="/store/cart"
          className="fixed bottom-6 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-2xl bg-[var(--color-brand)] px-5 py-3.5 text-white shadow-2xl"
        >
          <span className="text-sm font-bold">
            {cartCount} item{cartCount > 1 ? "s" : ""} · {formatPrice(cart?.totalPaise ?? 0)}
          </span>
          <span className="text-sm font-black">View cart ›</span>
        </Link>
      ) : null}
    </div>
  );
}
