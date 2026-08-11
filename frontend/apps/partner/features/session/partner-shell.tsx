"use client";

import { hasRole, useAuthGuard, useLogout, useSwitchRole, type WorkspaceGrant } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, Spinner, cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";
import {
  activeWorkspace,
  navigationFor,
  resolveWorkspaces,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import { WorkspaceSwitcher } from "@/features/workspace/workspace-switcher";

/**
 * The signed-in Partner shell: one gate and one navigation for every screen
 * behind a session.
 *
 * ## Why one shell rather than a check per screen
 *
 * Offers, availability and onboarding each grew their own login form, their own
 * "checking…" state and their own error card. Three copies of a session decision
 * is three chances to word a lock-out differently, and it is why a Partner could
 * be sent to a login form on `/apply` while `/offers` showed an empty inbox for
 * the same expired cookie. Logging in is a whole-app concern, so it has one
 * implementation and one route.
 *
 * ## Why the role is a prop rather than a constant
 *
 * `IsPartnerUser` guards offers, availability and presence, but onboarding is
 * deliberately `IsAuthenticated` only: Django grants the `partner` role when an
 * application is *created*, so demanding it on `/apply` would lock out every
 * person who has not applied yet — the exact people that tree exists for. The
 * shell therefore asks for the role only where Django does.
 *
 * ## What this shell will not do
 *
 * It never decides authorization itself. `useAuthGuard` reports what Django's
 * session projection says, and Django refuses anything the projection got wrong.
 * This only picks which honest screen to show.
 */

export const PARTNER_ROLE = "partner";

function ShellMessage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
      {children}
    </main>
  );
}

/**
 * Signed in, holds the Partner grant, but Django has another role selected.
 *
 * Worth its own screen rather than a generic refusal: the person does have
 * access and one action fixes it. This is not a hypothetical — on login Django
 * selects the alphabetically first grant, so anyone who is both a Customer and a
 * Partner lands here every time, and treating it as a denial is how they
 * conclude their Partner account is broken.
 *
 * Exported because the home embeds the offer inbox directly and needs the same
 * recovery inline, without sending the Partner to a different route to find it.
 */
export function SwitchToPartner({ inline = false }: { inline?: boolean } = {}) {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  const card = (
    <Card className="w-full max-w-md p-6">
      <h2 className="text-lg font-bold text-text">Switch to your Partner account</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        You are signed in with a different role. Switch to Partner to see the work
        being offered to you.
      </p>

      {switchRole.isError ? (
        <ErrorState
          inline
          className="mt-4"
          title="We could not switch your role"
          message="Nothing has changed. Try again, or sign in with the number your Partner account uses."
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={() => switchRole.mutate(PARTNER_ROLE)}
          loading={switchRole.isPending}
          loadingLabel="Switching"
        >
          Switch to Partner
        </Button>
        <Button variant="ghost" onClick={() => logout.mutate()}>
          Sign in as someone else
        </Button>
      </div>
    </Card>
  );

  if (inline) return card;

  return <main className="mx-auto flex w-full max-w-md px-4 py-16">{card}</main>;
}

function NoPartnerAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md px-4 py-16">
      <Card className="w-full p-6">
        <h1 className="text-lg font-bold text-text">You do not have a Partner account</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          This part of the app is for people who work through Vsolve Hub. Applying
          takes a few minutes and does not commit you to anything.
        </p>
        <Link
          href="/apply"
          className="mt-6 inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Become a Partner
        </Link>
        <Button variant="ghost" className="mt-3" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}

export interface PartnerShellProps {
  children: ReactNode;
  /**
   * Requires Django's *selected* role to be `partner`, matching
   * `IsPartnerUser`. Left off for onboarding, which Django guards with
   * `IsAuthenticated` alone.
   */
  requirePartnerRole?: boolean;
  /**
   * Approved M2 lifecycle capabilities, as Django published them.
   *
   * A prop rather than a hook because `M2-BE-114`'s endpoint is not published
   * yet. Defaulting to none is the correct behaviour for every Partner today —
   * an A1 task partner holds no M2 capability and sees exactly the navigation
   * they see now — and it is the same rendering a suspended or still-under-review
   * capability must produce, since neither authorizes anything.
   *
   * The shell deliberately cannot tell those three apart. Distinguishing "not
   * applied", "under review" and "suspended" needs the capability-status read
   * requested in `contracts/proposals/0012-m2-capability-and-requirement-surface.md`;
   * inferring it from an empty grant list would put a review banner in front of
   * every existing Partner.
   */
  workspaceGrants?: readonly WorkspaceGrant[];
}

const NO_GRANTS: readonly WorkspaceGrant[] = [];

export function PartnerShell({
  children,
  requirePartnerRole = false,
  workspaceGrants = NO_GRANTS,
}: PartnerShellProps) {
  const guard = useAuthGuard(
    getApiClient(),
    requirePartnerRole
      ? { requiredRoles: [PARTNER_ROLE], requireActiveRole: true }
      : {},
  );
  const logout = useLogout(getApiClient());
  const pathname = usePathname();
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";

  /**
   * Sending someone to login is a navigation, not a screen.
   *
   * The previous per-screen login forms left the browser on `/offers` while
   * showing a phone field, so signing in had nowhere to return to and the URL
   * described a page nobody was looking at. Carrying the current path as `next`
   * is what makes a deep link survive an expired cookie.
   */
  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  if (guard.status === "checking") {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Checking your access…
      </ShellMessage>
    );
  }

  if (isUnauthenticated) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Taking you to sign in…
      </ShellMessage>
    );
  }

  if (guard.status === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title="We could not check your access"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  // Selecting the Partner role for them. This app is deployed on its own domain,
  // so the domain is the role — and since Django re-grants `customer` on every
  // login and picks the alphabetically first grant, every Partner sign-in would
  // otherwise land on a picker asking a question the URL already answered.
  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Opening your account…
      </main>
    );
  }

  if (guard.status === "forbidden") {
    // Normally handled above. Reaching here with the grant means the automatic
    // switch was refused, so this is a real fallback; without the grant it is an
    // invitation to apply, not a denial.
    return hasRole(guard.user, PARTNER_ROLE) ? (
      <SwitchToPartner />
    ) : (
      <NoPartnerAccess onSignOut={() => logout.mutate()} />
    );
  }

  // Resolved after the guard, so a signed-out or forbidden visitor never has
  // navigation computed for a session they do not hold.
  const workspaces = resolveWorkspaces(workspaceGrants);
  const workspace = activeWorkspace(workspaces, pathname);
  const navItems = navigationFor(workspace);

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <Logo className="h-7 w-auto" />
            <span className="text-sm font-semibold text-text-secondary">Partner</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            loading={logout.isPending}
            loadingLabel="Signing out"
          >
            Sign Out
          </Button>
        </div>

        {/* Renders nothing until a Partner actually holds an M2 capability. */}
        {workspaces.length > 0 ? (
          <div className="mx-auto max-w-2xl px-3 pb-2">
            <WorkspaceSwitcher workspaces={workspaces} active={workspace} />
          </div>
        ) : null}
      </header>

      {/* ---- Page content ---- */}
      <ShellContent>{children}</ShellContent>

      {/* ---- Bottom tab bar ---- */}
      <BottomTabBar items={navItems} />
    </div>
  );
}

/**
 * The bottom tab bar navigation.
 *
 * Fixed to the bottom of the viewport. Uses Lucide icons for visual clarity.
 * The active tab gets a navy pill background with white text and icon; inactive
 * tabs use muted text. All tabs are 44px minimum touch targets.
 *
 * Items are passed in rather than read from a module constant: which
 * destinations exist depends on what Django authorized, and a component that
 * decided that for itself would be deciding authorization from the client.
 */
function BottomTabBar({ items }: { items: readonly WorkspaceNavItem[] }) {
  const pathname = usePathname();

  /**
   * Longest matching prefix, resolved once rather than per item.
   *
   * A workspace nests its own routes under its home — `/workforce` and
   * `/workforce/crew` are both tabs — so a plain per-item prefix test lights up
   * two tabs at once and emits two `aria-current="page"` elements in one nav,
   * which is invalid and leaves a screen-reader user with no idea where they
   * are.
   */
  const currentHref = items.reduce<string | null>((best, item) => {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  return (
    <nav
      aria-label="Partner navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
    >
      <ul className="mx-auto flex max-w-2xl list-none justify-around p-0">
        {items.map((item) => {
          const isCurrent = item.href === currentHref;
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 text-[0.625rem] font-semibold",
                  "transition-colors duration-fast ease-out",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action",
                  isCurrent
                    ? "text-action-secondary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-fast",
                    isCurrent ? "bg-selected-surface" : "",
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isCurrent ? 2.5 : 2}
                    aria-hidden
                  />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Holds the page and moves focus to it on every navigation.
 *
 * A client-side route change swaps the content but leaves focus wherever the
 * activated link was, so a screen-reader or keyboard user stays parked in the
 * navigation and hears nothing about the page they just opened. Focusing the
 * container — not a heading, which would announce the heading twice — puts them
 * at the top of the new content, and `outline-none` keeps a mouse user from
 * seeing a ring they did not ask for.
 *
 * Deliberately not a `<main>`: each page owns that landmark, and a second one
 * here would give every route two.
 */
function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * The path this shell was mounted on.
   *
   * Compared against, rather than a "have I run before?" flag. Strict Mode
   * double-invokes effects, so a flag flipped on the first pass is already false
   * on the second and the focus fires on initial load after all — which drops
   * the header and the whole navigation out of the tab order, because the first
   * Tab then continues from inside this container. A value that only differs
   * after a real navigation cannot be fooled by running twice.
   */
  const mountedAt = useRef(pathname);

  useEffect(() => {
    // Initial load is the browser's own navigation; focus belongs where it put it.
    if (pathname === mountedAt.current) return;
    contentRef.current?.focus();
  }, [pathname]);

  return (
    <div ref={contentRef} tabIndex={-1} className="flex-1 pb-20 outline-none">
      {children}
    </div>
  );
}
