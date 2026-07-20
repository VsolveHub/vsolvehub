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
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
    >
      <FlaticonIcon name="cart" size={18} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
