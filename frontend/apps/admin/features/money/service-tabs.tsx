"use client";

import { segmentStyles } from "@vsolve/ui";
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
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={segmentStyles({ selected: active === tab.key })}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
