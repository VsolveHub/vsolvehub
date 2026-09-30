"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { canonicalDetailPath } from "./routes";

/**
 * Swaps an old id address (/stays/0b5e…) for the readable one (/stays/sunrise-pg-madhapur)
 * without reloading. `beforeSwap` can seed the query cache so the page does not refetch.
 */
export function useCanonicalSlug(
  basePath: string,
  current: string | undefined,
  slug: string | undefined,
  beforeSwap?: () => void,
): void {
  const router = useRouter();
  useEffect(() => {
    const target = canonicalDetailPath(basePath, current, slug);
    if (!target) return;
    beforeSwap?.();
    router.replace(target, { scroll: false });
    // `beforeSwap` is a fresh closure each render; the swap depends only on the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, current, slug, router]);
}
