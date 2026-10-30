import type { Metadata } from "next";
import { CompatibilityRulesWorkspace } from "@/features/compatibility-rules/view/compatibility-rules-workspace";

export const metadata: Metadata = { title: "Service rules" };

/**
 * Service compatibility rules.
 *
 * List and detail side by side on a wide screen, stacked on a narrow one — the
 * same shape as Partner application review, because it is the same job: find the
 * thing waiting on you, read it, decide.
 *
 * The selected id lives in component state rather than the URL, following the
 * review queue. A rule id in a shareable link is an invitation to send someone
 * straight to a decision without the queue context that says whether it is
 * theirs to take.
 */
export default function CompatibilityRulesPage() {
  return (
    <>

      <CompatibilityRulesWorkspace />
    </>
  );
}
