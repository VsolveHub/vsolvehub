"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";

const STATUS_FLOW = ["PLACED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Order placed",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function StatusTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return <p className="mt-2 text-xs font-bold text-red-500">Cancelled</p>;
  }
  const idx = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);
  return (
    <div className="mt-3 flex items-center gap-1">
      {STATUS_FLOW.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-green-500" : "bg-gray-200"} ${i === 0 ? "opacity-0" : ""}`} />
            <div
              className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                i <= idx ? "border-green-500 bg-green-500" : "border-gray-300 bg-white"
              }`}
            />
            <div className={`h-1 flex-1 rounded-full ${i < idx ? "bg-green-500" : "bg-gray-200"} ${i === STATUS_FLOW.length - 1 ? "opacity-0" : ""}`} />
          </div>
          <span className={`text-center text-[9px] font-bold ${i <= idx ? "text-green-700" : "text-gray-400"}`}>
            {STATUS_LABEL[s]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StoreOrdersClient() {
  const { data, isLoading } = useQuery({
    queryKey: qk.storeOrders(),
    queryFn: api.storeOrders,
    refetchInterval: 30_000,
  });

  const orders = data?.orders ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <Link href="/store" className="text-sm font-bold text-gray-500 hover:text-gray-800">
        ‹ Store
      </Link>
      <h1 className="mt-2 text-xl font-black text-gray-900">My orders</h1>

      {isLoading ? (
        <p className="mt-10 text-center text-sm text-gray-400">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-4xl">📦</p>
          <p className="mt-3 text-sm font-semibold text-gray-500">No orders yet.</p>
          <Link
            href="/store"
            className="mt-4 inline-block rounded-2xl bg-[var(--color-brand)] px-6 py-3 text-sm font-black text-white"
          >
            Browse store
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {orders.map((o) => (
            <div key={o.orderRef} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-gray-900">{o.orderRef}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    {o.itemCount} item{o.itemCount > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="text-sm font-black text-gray-900">{formatPrice(o.totalPaise)}</span>
              </div>
              <p className="mt-1.5 truncate text-xs text-gray-500">
                {o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
              </p>
              <StatusTimeline status={o.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
