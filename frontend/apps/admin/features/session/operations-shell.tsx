"use client";

import { hasRole, useAuthGuard, useLogout, useOtpFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The signed-in Operations shell.
 *
 * ## Why the active role is enforced, not just the grant
 *
 * `IsOperationsUser` asks Django which role the session is currently *acting*
 * as, not merely which grants the user holds. Someone with both a Customer and
 * an Operations grant, signed in as Customer, is refused by every Operations
 * endpoint. Rendering the workspace on the grant alone would show a reviewer a
 * console where every action returns 403 — so the guard requires the selected
 * role and offers the switch when it is the only thing missing.
 *
 * ## What this shell will not do
 *
 * It never decides authorization itself. `useAuthGuard` reports what Django's
 * session projection says, and Django refuses anything the projection got
 * wrong. A client-side check that permitted more than the server would be a
 * bug; one that permitted less would be a lock-out. This one only picks which
 * honest screen to show.
 */

const OPERATIONS_ROLE = "operations";

/**
 * Every workspace this console can reach.
 *
 * Rendered only inside the authenticated branch. An unauthenticated visitor
 * learns nothing about what Operations can do from the login screen, which is
 * the same reason the home page carries no readiness dashboard.
 */
const WORKSPACES: { href: string; label: string }[] = [
  { href: "/reviews", label: "Partner applications" },
  { href: "/operations/compatibility-rules", label: "Compatibility rules" },
  { href: "/operations/manual-offers", label: "Offer work" },
  { href: "/operations/assisted-checkouts", label: "Assisted checkout" },
  { href: "/operations/partner-availability", label: "Partner availability" },
];

function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Operations workspaces" className="border-b border-line bg-surface">
      <ul className="mx-auto flex max-w-7xl list-none flex-wrap gap-1 px-4 py-2 sm:px-6 lg:px-8">
        {WORKSPACES.map((entry) => {
          const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold",
                  active
                    ? "bg-selected-surface text-text-link"
                    : "text-text-secondary hover:bg-surface-hover",
                ].join(" ")}
              >
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OperationsLogin() {
  const flow = useOtpFlow(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <Logo className="h-8 w-auto" />
        <h1 className="mt-6 text-2xl font-bold text-text">Operations</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Staff sign-in. Use the mobile number your access was granted to.
        </p>

        <div className="mt-6">
          <OtpForm
            {...flow}
            heading="Your mobile number"
            headingLevel={2}
            description="We will text you a code. There is no password."
            verifyLabel="Verify and continue"
          />
        </div>
      </Card>
    </main>
  );
}

/**
 * Signed in, holds the grant, but Django has a different role selected.
 *
 * Worth its own screen rather than a generic "forbidden": the person does have
 * access, and one action fixes it. Treating this as a denial is how a reviewer
 * concludes their account is broken.
 */
function SwitchToOperations() {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">Switch to Operations</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You are signed in with a different role. Switch to Operations to use
          this console.
        </p>

        {switchRole.isError ? (
          <ErrorState
            inline
            className="mt-4"
            title="We could not switch your role"
            message="Nothing has changed. Try again, or sign in with the account that has Operations access."
          />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={() => switchRole.mutate(OPERATIONS_ROLE)}
            loading={switchRole.isPending}
            loadingLabel="Switching"
          >
            Switch to Operations
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign in as someone else
          </Button>
        </div>
      </Card>
    </main>
  );
}

function NoOperationsAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">You do not have access</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          This console is limited to staff with Operations access. If you think
          that is wrong, ask your team lead — access is granted per account, not
          requested here.
        </p>
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}

export function OperationsShell({ children }: { children: ReactNode }) {
  const guard = useAuthGuard(getApiClient(), {
    requiredRoles: [OPERATIONS_ROLE],
    requireActiveRole: true,
  });
  const logout = useLogout(getApiClient());

  if (guard.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Checking your access…
      </main>
    );
  }

  if (guard.status === "unauthenticated") return <OperationsLogin />;

  if (guard.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <ErrorState
            title="We could not check your access"
            message="Nothing has changed. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  if (guard.status === "forbidden") {
    // Holding the grant but acting as another role is recoverable in one click;
    // not holding it at all is not.
    return hasRole(guard.user, OPERATIONS_ROLE) ? (
      <SwitchToOperations />
    ) : (
      <NoOperationsAccess onSignOut={() => logout.mutate()} />
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
            <span className="text-sm font-semibold text-text-secondary">Operations</span>
          </div>
          <div className="flex items-center gap-3">
            <span data-numeric className="text-sm text-text-secondary">
              {guard.user.phone_number}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              loadingLabel="Signing out"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <WorkspaceNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
