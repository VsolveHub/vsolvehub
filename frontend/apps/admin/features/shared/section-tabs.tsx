"use client";

import { Badge, cn } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export type SectionTab = {
  id: string;
  label: string;
  /** A count worth a glance, e.g. disputes waiting. Hidden at zero. */
  count?: number;
  render: () => ReactNode;
};

/** The tab named by `?tab=`, or the first one. Exported for tests. */
export function activeTabId(tabs: Pick<SectionTab, "id">[], requested: string | null): string {
  return tabs.some((tab) => tab.id === requested) ? (requested as string) : (tabs[0]?.id ?? "");
}

/**
 * One area of the console (Rentals, Stays, Payouts), split into its jobs.
 *
 * The tab is a query parameter so the Home screen and a teammate's pasted link can open the
 * right one. Pages that mount this need a `Suspense` boundary for `useSearchParams`.
 */
export function SectionTabs({
  title,
  description,
  tabs,
}: {
  title: string;
  description: string;
  tabs: SectionTab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = activeTabId(tabs, params.get("tab"));
  const tab = tabs.find((entry) => entry.id === current);

  const select = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </header>
      <div role="tablist" aria-label={title} className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((entry) => {
          const on = entry.id === current;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(entry.id)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                on
                  ? "border-action text-text-link"
                  : "border-transparent text-text-secondary hover:border-line-strong hover:text-text",
              )}
            >
              {entry.label}
              {entry.count ? <Badge tone="warning">{entry.count}</Badge> : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{tab?.render()}</div>
    </div>
  );
}
