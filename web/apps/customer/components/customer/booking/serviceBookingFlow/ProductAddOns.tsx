"use client";

// Product add-ons for the booking flow: shows ONLY the products mapped to the
// selected service (Service → Product mapping), so an electrical job offers
// switches and MCBs, never plumbing accessories. Buying here means the
// technician arrives with the right parts.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";

const SECTION_TITLE = "mb-4 text-[0.8rem] font-bold tracking-[0.05em] text-gray-600";

export type ProductSelections = Record<string, number>;

export function ProductAddOns({
  serviceId,
  value,
  onChange,
}: {
  serviceId: string;
  value: ProductSelections;
  onChange: (v: ProductSelections) => void;
}) {
  const { data } = useQuery({
    queryKey: qk.serviceProducts(serviceId),
    queryFn: () => api.serviceProducts(serviceId),
    staleTime: 5 * 60_000,
  });
  const products = data?.products ?? [];
  if (products.length === 0) return null;

  const setQty = (productId: string, qty: number) => {
    const next = { ...value };
    if (qty <= 0) delete next[productId];
    else next[productId] = qty;
    onChange(next);
  };

  const subtotal = products.reduce((s, p) => s + (value[p.id] ?? 0) * p.pricePaise, 0);

  return (
    <div className="mb-6">
      <h3 className={SECTION_TITLE}>ADD PRODUCTS FOR THIS JOB (OPTIONAL)</h3>
      <p className="-mt-2 mb-4 text-[0.8rem] text-gray-500">
        Bought here at platform prices — your professional brings them along.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((p) => {
          const qty = value[p.id] ?? 0;
          const soldOut = !p.inStock;
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                qty > 0 ? "border-[var(--color-brand)] bg-blue-50/40" : "border-gray-200 bg-white"
              } ${soldOut ? "opacity-60" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">
                  {p.name}
                  {p.featured ? (
                    <span className="ml-2 rounded-full bg-[var(--color-brand-light)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-brand)]">
                      Popular
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {p.brandName ? `${p.brandName} · ` : ""}
                  <span className="font-bold text-gray-900">{formatPrice(p.pricePaise)}</span>
                  {p.mrpPaise > p.pricePaise ? (
                    <span className="ml-1 text-gray-400 line-through">{formatPrice(p.mrpPaise)}</span>
                  ) : null}
                </p>
              </div>

              {soldOut ? (
                <span className="shrink-0 text-xs font-bold text-red-500">Out of stock</span>
              ) : qty === 0 ? (
                <button
                  type="button"
                  onClick={() => setQty(p.id, 1)}
                  className="shrink-0 rounded-lg border-2 border-[var(--color-brand)] px-4 py-1.5 text-xs font-black text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]"
                >
                  Add
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-gray-200 bg-white px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQty(p.id, qty - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-extrabold text-gray-700"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-black text-[var(--color-brand)]">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(p.id, Math.min(qty + 1, p.stockQty))}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-extrabold text-gray-700"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {subtotal > 0 ? (
        <p className="mt-3 text-right text-sm font-bold text-gray-700">
          Products subtotal: <span className="text-[var(--color-brand)]">{formatPrice(subtotal)}</span>
        </p>
      ) : null}
    </div>
  );
}
