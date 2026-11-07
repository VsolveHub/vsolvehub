"use client";

import { cn } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The one tab bar on the Rentals, Stays and Jobs pages, so the three read the same way.
 *
 * The open tab is kept in `?tab=`, so a link or a refresh lands on the same tab.
 */
export interface ServiceTab<K extends string> {
  key: K;
  label: string;
}

export function useServiceTab<K extends string>(tabs: readonly ServiceTab<K>[]): [K, (next: K) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const first = tabs[0];
  if (!first) throw new Error("useServiceTab needs at least one tab");
  const active = (tabs.find((tab) => tab.key === raw) ?? first).key;
  const select = (next: K) => {
    const query = new URLSearchParams(params.toString());
    if (next === first.key) query.delete("tab");
    else query.set("tab", next);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };
  return [active, select];
}

export function ServiceTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: readonly ServiceTab<K>[];
  active: K;
  onChange: (next: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              // An underline, not a raised chip: the open tab must read at a glance on any background.
              "min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
              selected
                ? "border-[#EA580C] text-navy-900"
                : "border-transparent text-text-secondary hover:border-line-strong hover:text-text",
            )}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A filter chip (a period, a stage, a kind) under a tab. The selected chip is filled so it never
 * blends into the page, which the bare segment style does when it has no track behind it.
 */
export function filterChipStyles(selected: boolean): string {
  return cn(
    "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    selected
      ? "border-navy-900 bg-navy-900 text-warm-0"
      : "border-line bg-surface text-text-secondary hover:border-line-strong hover:text-text",
  );
}
