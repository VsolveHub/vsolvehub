"use client";

import { Skeleton } from "@vsolve/ui";
import type { ReactNode } from "react";

import { ServiceTabs, useServiceTab, type ServiceTab } from "./service-tabs";

/** What a tab shows while its code arrives: the shape of a list, not a spinner. */
export function TabLoading() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export interface WorkspaceTab<K extends string> extends ServiceTab<K> {
  render: () => ReactNode;
}

/**
 * One service's Operations page: a title, one line on what it is for, and its tabs. Rentals,
 * Stays and Jobs grew this shape on their own; Home services and Crew & projects use it directly.
 */
export function ServiceWorkspace<K extends string>({
  title,
  description,
  tabs,
}: {
  title: string;
  description: string;
  tabs: readonly WorkspaceTab<K>[];
}) {
  const [active, setActive] = useServiceTab(tabs);
  const tab = tabs.find((entry) => entry.key === active);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </header>
      <ServiceTabs tabs={tabs} active={active} onChange={setActive} label={`${title} sections`} />
      <div>{tab?.render()}</div>
    </div>
  );
}
