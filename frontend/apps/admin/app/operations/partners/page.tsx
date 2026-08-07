"use client";

import { useState } from "react";

import { OperationsShell } from "@/features/session/operations-shell";
import { PartnerDirectory } from "@/features/partners/view/partner-directory";
import { PartnerRecord } from "@/features/partners/view/partner-record";
import type { PartnerDirectoryFilters } from "@/features/partners/queries";

/**
 * Partner management.
 *
 * Replaces "Partner reviews" in the sidebar. That screen still exists and still owns deciding on
 * an application — this one owns finding a Partner and reading their record, which the review
 * queue structurally cannot do: it lists only the three in-review statuses, so everyone already
 * approved is invisible in it.
 *
 * The selected id stays in component state rather than the URL, for the same reason the review
 * screen keeps it there: a partner id in a shareable link is a small invitation to pass one
 * around outside the audited read.
 */
export default function PartnersPage() {
  const [filters, setFilters] = useState<PartnerDirectoryFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Partners</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Everyone on the platform, whatever their application status. Filter by status or skill,
        then open a partner to see their application details, coverage and history.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] items-start">
        <PartnerDirectory
          filters={filters}
          onFiltersChange={setFilters}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <PartnerRecord partnerId={selectedId} />
      </div>
    </OperationsShell>
  );
}
