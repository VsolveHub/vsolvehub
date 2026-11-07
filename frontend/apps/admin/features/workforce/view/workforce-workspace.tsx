"use client";

import dynamic from "next/dynamic";

import { ServiceWorkspace, TabLoading, type WorkspaceTab } from "@/features/money/service-workspace";

// Each tab's code is fetched only when that tab is opened.
const WorkforceRequests = dynamic(() => import("./workforce-requests").then((m) => m.WorkforceRequests), {
  loading: TabLoading,
});
const CustomItemReviewQueue = dynamic(
  () => import("@/features/m2-work-items/view/custom-item-review-queue").then((m) => m.CustomItemReviewQueue),
  { loading: TabLoading },
);
const MoneyTab = dynamic(() => import("@/features/money/money-tab").then((m) => m.MoneyTab), {
  loading: TabLoading,
});
const WorkItemsBoard = dynamic(
  () => import("@/features/m2-work-items/view/work-items-board").then((m) => m.WorkItemsBoard),
  { loading: TabLoading },
);
const RateCardBoard = dynamic(
  () => import("@/features/m2-rate-cards/view/rate-card-board").then((m) => m.RateCardBoard),
  { loading: TabLoading },
);

type WorkforceTab = "requests" | "item-reviews" | "money" | "work-items" | "rate-cards";

export const WORKFORCE_TABS: readonly WorkspaceTab<WorkforceTab>[] = [
  { key: "requests", label: "Requests", render: () => <WorkforceRequests /> },
  // A daily review queue, so it is a tab of its own, not a section under the catalogue settings.
  { key: "item-reviews", label: "Custom-item reviews", render: () => <CustomItemReviewQueue /> },
  { key: "money", label: "Money", render: () => <MoneyTab service="workforce" /> },
  { key: "work-items", label: "Work items", render: () => <WorkItemsBoard /> },
  { key: "rate-cards", label: "Crew rate cards", render: () => <RateCardBoard /> },
];

/** Crew hire (A3) and custom projects (A5): every request (stuck ones as a filter), reviews, money and pricing. */
export function WorkforceWorkspace() {
  return (
    <ServiceWorkspace
      title="Crew & projects"
      description="Crew hire and custom projects: find any request, unstick the ones past a deadline, review custom items, set crew rates and see the money."
      tabs={WORKFORCE_TABS}
    />
  );
}
