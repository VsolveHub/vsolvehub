"use client";

import { hasRole, useAuthGuard, useLogout, useOtpFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

import { useState } from "react";
import {
  Home,
  ClipboardCheck,
  Briefcase,
  Wallet,
  RotateCcw,
  Truck,
  Tag,
  ShoppingCart,
  Sliders,
  Calendar,
  ToggleLeft,
  User,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

const OPERATIONS_ROLE = "operations";

/**
 * Every workspace this console can reach.
 *
 * Rendered only inside the authenticated branch. An unauthenticated visitor
 * learns nothing about what Operations can do from the login screen, which is
 * the same reason the home page carries no readiness dashboard.
 */
const WORKSPACES: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/reviews", label: "Partner reviews", icon: ClipboardCheck },
  { href: "/operations/cases", label: "Cases", icon: Briefcase },
  { href: "/operations/payouts", label: "Payouts", icon: Wallet },
  { href: "/finance", label: "Refunds", icon: RotateCcw },
  { href: "/operations/dispatch", label: "Dispatch", icon: Truck },
  { href: "/operations/manual-offers", label: "Manual offers", icon: Tag },
  { href: "/operations/assisted-checkouts", label: "Assisted checkout", icon: ShoppingCart },
  { href: "/operations/compatibility-rules", label: "Compatibility rules", icon: Sliders },
  { href: "/operations/partner-availability", label: "Availability", icon: Calendar },
  { href: "/operations/kill-switches", label: "Kill switches", icon: ToggleLeft },
  { href: "/operations/profile", label: "Profile", icon: User },
];

function SidebarNav({
  isMobileMenuOpen,
  onCloseMobileMenu,
}: {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}) {
  const pathname = usePathname();

  const content = (
    <nav aria-label="Operations workspaces" className="flex flex-col gap-1 p-3">
      <ul className="flex flex-col gap-1 list-none p-0 m-0">
        {WORKSPACES.map((entry) => {
          const Icon = entry.icon;
          const active =
            entry.href === "/"
              ? pathname === "/"
              : pathname === entry.href || pathname.startsWith(`${entry.href}/`);

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                onClick={onCloseMobileMenu}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-selected-surface text-text-link font-semibold"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text",
                ].join(" ")}
              >
                <Icon className={["h-4 w-4 shrink-0", active ? "text-text-link" : "text-text-muted"].join(" ")} />
                <span>{entry.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-line bg-surface sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        {content}
      </aside>

      {/* Mobile drawer overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={onCloseMobileMenu}
          />
          <aside className="relative z-50 w-64 max-w-[80vw] bg-surface h-full shadow-xl flex flex-col border-r border-line">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <span className="font-semibold text-sm text-text">Navigation</span>
              <button
                type="button"
                onClick={onCloseMobileMenu}
                className="p-1 text-text-secondary hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">{content}</div>
          </aside>
        </div>
      )}
    </>
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const userDisplayName = guard.user.phone_number === "9999999999" || !guard.user.phone_number
    ? "Priya Nair (Dispatch)"
    : `${guard.user.phone_number} (Operations)`;

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top Header */}
      <header className="border-b border-line bg-surface sticky top-0 z-30 h-14">
        <div className="h-full flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1 text-text-secondary hover:text-text rounded-md focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <Logo className="h-6 w-auto" />
              <span className="text-sm font-bold text-text">Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/operations/profile"
              className="text-text-secondary hover:text-text font-medium hidden sm:inline transition-colors hover:underline"
            >
              {userDisplayName}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              loadingLabel="Signing out"
              className="text-text-secondary hover:text-text font-normal px-2"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Body container with Sidebar and Main Content */}
      <div className="flex flex-1">
        <SidebarNav
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
