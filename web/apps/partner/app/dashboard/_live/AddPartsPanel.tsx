"use client";

// Mid-job "Add parts" panel on the working screen. Lists only the products
// mapped to this booking's service; prices come from the catalog and are
// read-only for the partner. Submitting creates PENDING_APPROVAL items the
// customer must approve in their tracker before they hit the bill.

import { useEffect, useState, useTransition } from "react";
import { Package, Plus, Minus, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@vsolve/ui";
import { getPartsData, requestPartsAction, type PartsData } from "./parts-actions";

function inrPaise(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const STATUS_META = {
  APPROVED: { label: "Approved", icon: CheckCircle2, cls: "text-green-600" },
  PENDING_APPROVAL: { label: "Awaiting customer", icon: Clock3, cls: "text-amber-600" },
  DECLINED: { label: "Declined", icon: XCircle, cls: "text-red-500" },
} as const;

export function AddPartsPanel({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<PartsData | null>(null);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const reload = () => {
    getPartsData(bookingId).then(setData).catch(() => setData(null));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [bookingId]);

  if (!data?.ok || (data.products.length === 0 && data.items.length === 0)) return null;

  const setProductQty = (id: string, n: number) => {
    setQty((prev) => {
      const next = { ...prev };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  const selected = Object.entries(qty);
  const selectedTotal = selected.reduce((s, [id, n]) => {
    const p = data.products.find((x) => x.id === id);
    return s + (p ? p.pricePaise * n : 0);
  }, 0);

  const submit = () => {
    setError("");
    startTransition(async () => {
      const res = await requestPartsAction(
        bookingId,
        selected.map(([productId, n]) => ({ productId, qty: n })),
      );
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setQty({});
      setOpen(false);
      reload();
    });
  };

  return (
    <div className="mt-4">
      {data.items.length > 0 && (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Parts on this job</p>
          <div className="space-y-1.5">
            {data.items.map((item) => {
              const meta = STATUS_META[item.status];
              const Icon = meta.icon;
              return (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {item.name} <span className="text-gray-400">×{item.qty}</span>
                    </p>
                    <p className={cn("flex items-center gap-1 text-[11px] font-semibold", meta.cls)}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-ink-900">{inrPaise(item.totalPaise)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {data.products.length > 0 && !open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 py-3 text-sm font-bold text-brand-700 transition active:scale-[0.98]"
        >
          <Package className="h-4 w-4" /> Add parts (needs customer approval)
        </button>
      ) : null}

      {open ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Parts for this service</p>
          <p className="mb-2 text-[11px] text-gray-400">Platform prices — the customer approves before it&apos;s billed.</p>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {data.products.map((p) => {
              const n = qty[p.id] ?? 0;
              const soldOut = !p.inStock;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                    n > 0 ? "border-brand-300 bg-brand-50/60" : "border-border",
                    soldOut && "opacity-50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {p.brandName ? `${p.brandName} · ` : ""}
                      <span className="font-bold text-ink-900">{inrPaise(p.pricePaise)}</span>
                    </p>
                  </div>
                  {soldOut ? (
                    <span className="shrink-0 text-[11px] font-bold text-red-500">Out of stock</span>
                  ) : n === 0 ? (
                    <button
                      onClick={() => setProductQty(p.id, 1)}
                      className="shrink-0 rounded-lg border border-brand-300 px-3 py-1 text-xs font-bold text-brand-700"
                    >
                      Add
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => setProductQty(p.id, n - 1)} className="grid h-6 w-6 place-items-center rounded-full bg-gray-100">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center text-sm font-bold text-brand-700">{n}</span>
                      <button
                        onClick={() => setProductQty(p.id, Math.min(n + 1, p.stockQty))}
                        className="grid h-6 w-6 place-items-center rounded-full bg-gray-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setQty({});
                setError("");
              }}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={selected.length === 0 || pending}
              className="flex-[2] rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? "Sending…" : selected.length === 0 ? "Select parts" : `Request approval · ${inrPaise(selectedTotal)}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
