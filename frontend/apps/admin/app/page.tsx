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
 * There is one console and one staff role. A previous revision routed the origin
 * by active role because refunds sat behind a separate `finance` grant; that
 * grant was never issued to anybody, so it made the money endpoints unreachable
 * rather than restricted, and refunds now live in the Operations nav like
 * everything else.
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
        You are signed in. Pick a workspace above — partner review, dispatch
        recovery, compatibility rules, offers, assisted checkout, availability
        and refunds.
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
