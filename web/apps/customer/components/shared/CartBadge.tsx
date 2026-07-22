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
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
    >
      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
      )}
    </Link>
  );
}
