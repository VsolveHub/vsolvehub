"use client";

import { ServiceTabs, useServiceTab } from "@/features/money/service-tabs";
import { CrewVerificationWorkspace } from "@/features/crew-verification/view/crew-verification-workspace";

import { ReviewsWorkspace } from "./reviews-workspace";

/** Both "check a partner's papers" queues on one page: applications, and crew members' IDs. */
const TABS = [
  { key: "applications", label: "Applications" },
  { key: "crew-documents", label: "Crew documents" },
] as const;

export function ApplicationsPage() {
  const [tab, setTab] = useServiceTab(TABS);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ServiceTabs tabs={TABS} active={tab} onChange={setTab} label="Partner reviews" />
      {tab === "applications" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ReviewsWorkspace />
        </div>
      ) : (
        <div className="overflow-auto pb-6">
          <p className="mb-4 max-w-prose text-sm text-text-secondary">
            Check crew members&apos; identity documents and record the result before a partner can
            assign them to customer work.
          </p>
          <CrewVerificationWorkspace />
        </div>
      )}
    </div>
  );
}
