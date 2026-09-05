import { PageHeader } from "@vsolve/ui";

import { PartnersWorkspace } from "@/features/partners/view/partners-workspace";

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
  return (
    <div className="-my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="shrink-0 px-4 py-6 sm:px-0">
        <PageHeader
          title="Partners"
          description="Find a Partner and read their record — application details, skills, coverage and history. The Partner reviews queue only lists applications awaiting a decision; everyone already approved is invisible there."
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-0">
        <PartnersWorkspace />
      </div>
    </div>
  );
}
