"use client";

import { useCurrentSession } from "@vsolve/query";
import { Card, Spinner, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { getApiClient } from "@/lib/api/browser";
import { OperationsShell } from "./operations-shell";

/**
 * Where a signed-in member of staff lands.
 *
 * ## Why the origin cannot just be Operations
 *
 * Django gives a session exactly one *active* role, and Finance and Operations
 * are different ones — `HasRecentFinanceStepUp` requires `finance`,
 * `IsOperationsUser` requires `operations`. Rendering the Operations shell
 * unconditionally therefore shows somebody acting as Finance a "you do not have
 * access" screen at the front door of a console they are entitled to use, with
 * nothing on it that leads anywhere. That is the same defect as a page with no
 * link to it: the workspace exists and cannot be reached.
 *
 * So the active role Django reports decides which landing is rendered. It is not
 * an authorization decision — each console still runs its own guard, and Django
 * still refuses anything either of them gets wrong. It only picks the door.
 *
 * The unauthenticated and unknown-role cases fall through to Operations, which
 * renders the staff sign-in and, after that, the honest refusal. Nothing here
 * enumerates the consoles for a visitor who holds neither.
 */
export function StaffHome() {
  const session = useCurrentSession(getApiClient());

  if (session.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Checking your access…
      </main>
    );
  }

  if (session.data?.active_role === "finance") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-16">
        <Card className="w-full p-8">
          <h1 className="text-xl font-bold text-text">Finance</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            You are signed in as Finance. Refunds and reconciliation are through
            here.
          </p>
          <Link href="/finance" className={buttonStyles({ className: "mt-6" })}>
            Go to refunds
          </Link>
        </Card>
      </main>
    );
  }

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
