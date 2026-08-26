import type { Metadata } from "next";
import { Suspense } from "react";

import { CaseWorkspace } from "@/features/m2-cases/view/case-workspace";
import { CasesTabs } from "@/features/m2-cases/view/cases-tabs";


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
    <>

      <CasesTabs />

      <div className="mt-6">
        {/* `useSearchParams` needs a boundary. The page is force-dynamic, so this never
            suspends in practice — it is here so the build cannot start depending on that. */}
        <Suspense fallback={null}>
          <CaseWorkspace />
        </Suspense>
      </div>
    </>
  );
}
