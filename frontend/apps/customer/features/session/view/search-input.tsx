"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useTransition } from "react";

export function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [prevQ, setPrevQ] = useState(searchParams.get("q"));

  // Sync state if URL changes externally
  if (searchParams.get("q") !== prevQ) {
    setPrevQ(searchParams.get("q"));
    setQuery(searchParams.get("q") ?? "");
  }

  // Debounce the search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query === (searchParams.get("q") ?? "")) return;

      const newParams = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        newParams.set("q", query.trim());
      } else {
        newParams.delete("q");
      }

      // If searching from homepage, redirect to catalog page
      const destPath = pathname === "/" ? "/catalog" : pathname;
      
      startTransition(() => {
        router.push(`${destPath}?${newParams.toString()}`);
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [query, pathname, router, searchParams]);

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
        {isPending ? (
          <div className="size-4 animate-spin rounded-full border-2 border-action border-t-transparent" />
        ) : (
          <svg className="size-4 text-text-muted/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // Only rendered once someone has asked to search, so the cursor goes straight in.
        autoFocus
        enterKeyHint="search"
        aria-label="Search services"
        placeholder="Search services..."
        className="block w-full rounded-full border border-line/80 py-2.5 pl-11 pr-4 text-base md:text-[0.875rem] font-medium text-navy-900 bg-surface-sunken ring-0 placeholder:text-text-muted focus:ring-1 focus:ring-action focus:border-action transition-all shadow-sm hover:border-navy-300"
      />
    </div>
  );
}
