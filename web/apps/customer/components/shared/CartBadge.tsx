"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

/**
 * Cart entry point in the header. Shows a live count of DRAFT cart items.
 * Renders inside QueryProvider (the whole app tree is wrapped in layout.tsx), so
 * the count stays in sync via the shared `qk.cart()` cache.
 */
export function CartBadge() {
  const { data } = useQuery({ queryKey: qk.cartCount(), queryFn: api.cartCount, staleTime: 30_000 });
  const count = data?.count ?? 0;

  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[#0b1c30] hover:bg-[#fff7ed] hover:text-[#ea580c] transition-all shrink-0 cursor-pointer"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#ea580c] px-1 text-[10px] font-extrabold text-white shadow-xs ring-2 ring-white">
          {count}
        </span>
      )}
    </Link>
  );
}
