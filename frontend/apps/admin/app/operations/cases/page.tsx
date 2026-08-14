import type { Metadata } from "next";
import { Suspense } from "react";

import { CaseWorkspace } from "@/features/m2-cases/view/case-workspace";
import { CasesTabs } from "@/features/m2-cases/view/cases-tabs";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cases",
  robots: { index: false, follow: false },
};

/**
 * The case queue, in M2's vocabulary.
 *
 * `08-frontend-information-architecture.md` §3: this is an **existing route**, and "M2 case kinds
 * join it rather than forking a second case system". So the mount changes and the endpoints do
 * not — the workspace imports the queue, claim, escalate, resolve and note hooks from
 * `features/cases/queries.ts` and adds only what contract 1.32.0 published.
 *
 * The selected case is a query parameter rather than component state, because a case id is a
 * thing operators paste to one another.
 */
export default function CasesPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Cases</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Assignment, lateness, quality, safety, payment — and M2&rsquo;s five: conflicting
        cancellations, disputed attendance, disputed milestones, off-platform payment claims and
        chargebacks. A case closes by naming what happened, not because somebody was contacted.
      </p>

      <CasesTabs />

      <div className="mt-6">
        {/* `useSearchParams` needs a boundary. The page is force-dynamic, so this never
            suspends in practice — it is here so the build cannot start depending on that. */}
        <Suspense fallback={<p className="text-sm text-text-secondary">Loading the queue…</p>}>
          <CaseWorkspace />
        </Suspense>
      </div>
    </OperationsShell>
  );
}
