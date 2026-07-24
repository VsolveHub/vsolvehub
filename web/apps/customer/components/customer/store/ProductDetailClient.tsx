"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { useSessionQuery } from "@/lib/query/hooks";

export function ProductDetailClient({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: sessionData } = useSessionQuery();
  const loggedIn = !!sessionData?.user;

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.storeProduct(slug),
    queryFn: () => api.storeProduct(slug),
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (productId: string) => api.addToStoreCart(productId, 1),
    onSuccess: (next) => queryClient.setQueryData(qk.storeCart(), next),
  });

  if (isLoading) return <p className="mt-16 text-center text-sm text-gray-400">Loading product…</p>;
  if (isError || !data?.product) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <p className="text-sm font-semibold text-gray-500">Product not found.</p>
        <Link href="/store" className="mt-3 inline-block text-sm font-bold text-[var(--color-brand)]">
          ‹ Back to store
        </Link>
      </div>
    );
  }

  const p = data.product;
  const discount = p.mrpPaise > p.pricePaise ? Math.round(((p.mrpPaise - p.pricePaise) / p.mrpPaise) * 100) : 0;

  const add = () => {
    if (!loggedIn) {
      router.push(`/booking/otp?redirect=/store/${slug}`);
      return;
    }
    addMutation.mutate(p.id, { onSuccess: () => router.push("/store/cart") });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <Link href="/store" className="text-sm font-bold text-gray-500 hover:text-gray-800">
        ‹ Store
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="flex h-64 items-center justify-center rounded-3xl bg-gray-50 text-6xl">
          {p.images[0] ? (
            <Image src={p.images[0]} alt={p.name} width={256} height={256} unoptimized className="h-full w-full rounded-3xl object-cover" />
          ) : (
            <span>📦</span>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
            {p.brandName ?? p.categoryName} · {p.sku}
          </p>
          <h1 className="mt-1 text-xl font-black leading-snug text-gray-900">{p.name}</h1>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-gray-900">{formatPrice(p.pricePaise)}</span>
            {discount > 0 ? (
              <>
                <span className="text-sm text-gray-400 line-through">{formatPrice(p.mrpPaise)}</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-black text-green-700">
                  {discount}% off
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-400">Inclusive of {p.gstRatePct}% GST</p>

          {p.description ? <p className="mt-4 text-sm leading-relaxed text-gray-600">{p.description}</p> : null}

          {Object.keys(p.specs).length > 0 ? (
            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Specifications</p>
              {Object.entries(p.specs).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-gray-100 py-1.5 text-sm last:border-0">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          ) : null}

          <button
            onClick={add}
            disabled={!p.inStock || addMutation.isPending}
            className="mt-6 w-full rounded-2xl bg-[var(--color-brand)] py-3.5 text-base font-black text-white transition-colors hover:bg-blue-900 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {!p.inStock ? "Out of stock" : addMutation.isPending ? "Adding…" : "Add to cart"}
          </button>
          {addMutation.isError ? (
            <p className="mt-2 text-center text-xs font-semibold text-red-500">
              {addMutation.error instanceof Error ? addMutation.error.message : "Couldn't add to cart"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
