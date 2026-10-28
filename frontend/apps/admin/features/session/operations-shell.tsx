"use client";

import { hasRole, useAuthGuard, useLogout, usePhoneAuthFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The signed-in Operations shell — the only staff console this platform has.
 *
 * ## Why the active role is enforced, not just the grant
 *
 * `IsOperationsUser` and `HasRecentOperationsStepUp` both ask Django which role
 * the session is currently *acting* as, not merely which grants the user holds.
 * Someone with both a Customer and an Operations grant, signed in as Customer,
 * is refused by every Operations endpoint. Rendering the workspace on the grant
 * alone would show a reviewer a console where every action returns 403 — so the
 * guard requires the selected role and offers the switch when that is the only
 * thing missing.
 *
 * That switch used to be the front door rather than a corner: Django picks the
 * alphabetically first grant when a session is created
 * (`create_authenticated_session`), and `verify_login_otp` re-grants `customer`
 * on *every* login, so `customer` sorts before `operations` and **every** staff
 * sign-in landed on a picker.
 *
 * It no longer does. This console is deployed on its own domain, so the domain
 * *is* the role — asking somebody who just signed in to the Operations console
 * which role they meant is asking a question the URL already answered.
 * `useAuthGuard` selects it automatically, and `SwitchToOperations` below is now
 * a genuine fallback for when that switch is refused.
 *
 * ## One role, one shell
 *
 * Refunds used to live behind a separate `finance` role. Nobody was ever granted
 * it, so the money endpoints were unreachable rather than restricted — the gate
 * is now `HasRecentOperationsStepUp`, which keeps the control that mattered (a
 * fresh OTP before money moves) and drops the role that only locked the door on
 * the people who were supposed to walk through it.
 *
 * ## What this shell will not do
 *
 * It never decides authorization itself. `useAuthGuard` reports what Django's
 * session projection says, and Django refuses anything the projection got wrong.
 * A client-side check that permitted more than the server would be a bug; one
 * that permitted less would be a lock-out. This one only picks which honest
 * screen to show.
 */

import { SidebarNavContent } from "./sidebar-nav";
import { MobileDrawer } from "./mobile-drawer";

const OPERATIONS_ROLE = "operations";

function OperationsLogin() {
  // Firebase or Django's own OTP, whichever NEXT_PUBLIC_PHONE_AUTH_PROVIDER names. The role
  // asks Django to refuse a number with no Operations grant before any code is sent.
  const flow = usePhoneAuthFlow(getApiClient(), { intendedRole: "operations" });

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
 * concludes their account is broken — and since every staff login lands here,
 * treating it as rare would be worse still.
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

  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Opening your console…
      </main>
    );
  }

  if (guard.status === "forbidden") {
    return hasRole(guard.user, OPERATIONS_ROLE) ? (
      <SwitchToOperations />
    ) : (
      <NoOperationsAccess onSignOut={() => logout.mutate()} />
    );
  }

  // The account's own name when it has one; the number otherwise. Never a placeholder person —
  // a made-up name in the header is a name a reviewer will believe.
  const userDisplayName =
    guard.user.display_name || guard.user.full_name || guard.user.phone_number || "Your account";

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top Header */}
      <header className="border-b border-line bg-surface sticky top-0 z-30 h-14">
        <div className="h-full flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileDrawer>
              <SidebarNavContent />
            </MobileDrawer>
            <div className="flex items-center gap-3">
              <Logo className="h-6 w-auto" />
              <span className="text-sm font-bold text-text">Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/operations/profile"
              className="hidden max-w-[16rem] truncate font-medium text-text-secondary transition-colors hover:text-text hover:underline sm:inline"
              title={userDisplayName}
            >
              {userDisplayName}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              loadingLabel="Signing out"
              className="whitespace-nowrap text-text-secondary hover:text-text font-normal px-2"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Body container with Sidebar and Main Content */}
      <div className="flex flex-1">
        <aside className="hidden md:block w-60 shrink-0 border-r border-line bg-surface sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <SidebarNavContent />
        </aside>
        {/* min-w-0: a wide table scrolls inside its own region instead of widening the page. */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
