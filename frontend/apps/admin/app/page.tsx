import type { Metadata } from "next";
import { Card } from "@vsolve/ui";

import { OperationsShell } from "@/features/session/operations-shell";

/**
 * The Operations home screen.
 *
 * Dynamic and uncached: everything behind the shell depends on the signed-in
 * reviewer, and a shared cache entry would be wrong for everyone after the
 * first. The anonymous branch renders the sign-in form and nothing else, so an
 * unauthenticated visitor still learns nothing about the system behind it.
 *
 * The workspaces themselves — partner review queue, cases, timelines — arrive
 * with FE-07 and later, each when its backend contract publishes. What is here
 * is deliberately empty rather than a readiness dashboard: a reviewer needs to
 * know what they can do, not what we have not built.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default function OperationsHomePage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Operations</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        You are signed in. Partner review, bookings and cases open here as each
        one becomes available.
      </p>

      <Card className="mt-6 p-5">
        <h2 className="text-base font-bold text-text">Nothing assigned to you yet</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          When Partner applications are ready for review, they will appear here.
        </p>
      </Card>
    </OperationsShell>
  );
}
