"use client";

import Link from "next/link";
import type { CheckoutItemOutcome } from "@/lib/cart/types";

export function CheckoutResultView({ orderRef, items }: { orderRef: string; items: CheckoutItemOutcome[] }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-xl font-black text-gray-900">Order placed</h1>
      <p className="mt-1 text-sm text-gray-500">Order {orderRef}</p>
      <div className="mt-6 flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.bookingRef} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-bold text-gray-900">{it.serviceName}</p>
            {it.outcome === "assigned" ? (
              <p className="mt-0.5 text-xs font-semibold text-green-700">
                Assigned to {it.partnerName ?? "a professional"}
              </p>
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-amber-700">
                No provider available{it.refunded ? " — refunded" : ""}
              </p>
            )}
            {it.outcome === "assigned" && (
              <Link href={`/booking/track/${it.bookingRef}`} className="mt-2 inline-block text-xs font-bold text-brand">
                Track booking ›
              </Link>
            )}
          </div>
        ))}
      </div>
      <Link
        href="/services"
        className="mt-8 block w-full rounded-xl bg-brand py-3.5 text-center text-sm font-bold text-white"
      >
        Back to services
      </Link>
    </div>
  );
}
