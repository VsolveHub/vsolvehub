"use client";

import { hasRole, useAuthGuard, useLogout, useOtpFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The signed-in staff shell, for whichever workspace is asking.
 *
 * ## Why the active role is enforced, not just the grant
 *
 * `IsOperationsUser` and `HasRecentFinanceStepUp` both ask Django which role the
 * session is currently *acting* as, not merely which grants the user holds.
 * Someone with both a Customer and an Operations grant, signed in as Customer,
 * is refused by every Operations endpoint. Rendering the workspace on the grant
 * alone would show a reviewer a console where every action returns 403 — so the
 * guard requires the selected role and offers the switch when that is the only
 * thing missing.
 *
 * ## Why this is one component and not two
 *
 * Operations and Finance are different roles with different workspaces, and a
 * copy of this file per role is a copy of the authorization branching per role.
 * The branching is the part that must not drift: the difference between "switch
 * your role" and "you do not have access" is the difference between a reviewer
 * fixing it in one click and a reviewer concluding their account is broken. What
 * differs between the two consoles is a role code, a name and a nav — so those
 * are the parameters, and nothing else is.
 *
 * ## What this shell will not do
 *
 * It never decides authorization itself. `useAuthGuard` reports what Django's
 * session projection says, and Django refuses anything the projection got wrong.
 * A client-side check that permitted more than the server would be a bug; one
 * that permitted less would be a lock-out. This one only picks which honest
 * screen to show.
 */

export interface Workspace {
  href: string;
  label: string;
}

export interface WorkspaceShellProps {
  /** Django's `Role.code` — lowercase, as `apps/partners/permissions.py` compares it. */
  role: string;
  /** The product name a person reads. Never the app name. */
  name: string;
  /** What this console is for, on the sign-in screen. */
  signInDescription: string;
  /**
   * Every workspace this console can reach.
   *
   * Rendered only inside the authenticated branch. An unauthenticated visitor
   * learns nothing about what staff can do from the login screen, which is the
   * same reason the home page carries no readiness dashboard.
   */
  workspaces: readonly Workspace[];
  children: ReactNode;
}

function WorkspaceNav({ workspaces, name }: { workspaces: readonly Workspace[]; name: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={`${name} workspaces`} className="border-b border-line bg-surface">
      <ul className="mx-auto flex max-w-7xl list-none flex-wrap gap-1 px-4 py-2 sm:px-6 lg:px-8">
        {workspaces.map((entry) => {
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

function StaffLogin({ name, description }: { name: string; description: string }) {
  const flow = useOtpFlow(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <Logo className="h-8 w-auto" />
        <h1 className="mt-6 text-2xl font-bold text-text">{name}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>

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
function SwitchRole({ role, name }: { role: string; name: string }) {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">Switch to {name}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You are signed in with a different role. Switch to {name} to use this
          console.
        </p>

        {switchRole.isError ? (
          <ErrorState
            inline
            className="mt-4"
            title="We could not switch your role"
            message="Nothing has changed. Try again, or sign in with the account that has this access."
          />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={() => switchRole.mutate(role)}
            loading={switchRole.isPending}
            loadingLabel="Switching"
          >
            Switch to {name}
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign in as someone else
          </Button>
        </div>
      </Card>
    </main>
  );
}

function NoAccess({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">You do not have access</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          This console is limited to staff with {name} access. If you think that
          is wrong, ask your team lead — access is granted per account, not
          requested here.
        </p>
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}

export function WorkspaceShell({
  role,
  name,
  signInDescription,
  workspaces,
  children,
}: WorkspaceShellProps) {
  const guard = useAuthGuard(getApiClient(), {
    requiredRoles: [role],
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

  if (guard.status === "unauthenticated") {
    return <StaffLogin name={name} description={signInDescription} />;
  }

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
    return hasRole(guard.user, role) ? (
      <SwitchRole role={role} name={name} />
    ) : (
      <NoAccess name={name} onSignOut={() => logout.mutate()} />
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
            <span className="text-sm font-semibold text-text-secondary">{name}</span>
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

      <WorkspaceNav workspaces={workspaces} name={name} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
