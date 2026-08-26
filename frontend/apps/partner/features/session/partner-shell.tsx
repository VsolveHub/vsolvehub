"use client";

import { hasRole, useAuthGuard, useCurrentSession, useLogout, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, Spinner, cn } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";
import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { usePartnerStreamEvents } from "@/features/offers/live-events";
import { NotificationNavTab } from "@/features/notifications/view/notification-bell";
import {
  resolveWorkspaces,
  TAP_FIRST_NAV,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

export const PARTNER_ROLE = "partner";

export type PartnerChromeMode = "full" | "focused" | "onboarding";

/**
 * Route chrome policy for Partner application:
 * - "full": persistent header + BottomTabBar on /home, /work/all, /money, /me, /me/*
 * - "onboarding": onboarding shell on /apply/* (no top/bottom navbar)
 * - "focused": compact Back button header, NO bottom tabs on detail/action routes
 */
export function getPartnerChromeMode(pathname: string): PartnerChromeMode {
  if (pathname.startsWith("/apply")) {
    return "onboarding";
  }
  if (
    pathname === "/home" ||
    pathname === "/work/all" ||
    pathname === "/money" ||
    pathname === "/me" ||
    pathname.startsWith("/me/")
  ) {
    return "full";
  }
  return "focused";
}

function ShellMessage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
      {children}
    </main>
  );
}

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

function FocusedHeader({ pathname }: { pathname: string }) {
  const router = useRouter();

  let title = "Details";
  if (pathname.startsWith("/work/offers")) {
    title = "Work Offer";
  } else if (pathname.startsWith("/work/enquiries")) {
    title = "Enquiry";
  } else if (pathname.startsWith("/work/jobs")) {
    title = "Job Details";
  } else if (pathname.startsWith("/account") || pathname.startsWith("/me")) {
    title = "Account";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-text-secondary hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="truncate px-2 text-base font-semibold text-text">{title}</h1>
        <div className="h-11 w-11" aria-hidden="true" />
      </div>
    </header>
  );
}

export interface PartnerShellProps {
  children: ReactNode;
  requirePartnerRole?: boolean;
}

export function PartnerShell({ children, requirePartnerRole = false }: PartnerShellProps) {
  const pathname = usePathname();
  const isApplyRoute = pathname.startsWith("/apply");

  const session = useCurrentSession(getApiClient());
  const hasPartnerGrant =
    session.data?.user !== undefined &&
    session.data.user !== null &&
    hasRole(session.data.user, PARTNER_ROLE);
  const shouldActAsPartner =
    !isApplyRoute && (requirePartnerRole || hasPartnerGrant);

  const guard = useAuthGuard(getApiClient(), {
    enabled: !session.isPending,
    requiredRoles: shouldActAsPartner ? [PARTNER_ROLE] : [],
    requireActiveRole: shouldActAsPartner,
  });

  const workspaceGrants = usePartnerWorkspaceGrants({
    enabled: guard.status === "authenticated" && hasRole(guard.user, PARTNER_ROLE),
  });
  const isPartnerAuthenticated =
    guard.status === "authenticated" && hasRole(guard.user, PARTNER_ROLE);
  usePartnerStreamEvents(isPartnerAuthenticated);
  const logout = useLogout(getApiClient());
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";
  const chromeMode = getPartnerChromeMode(pathname);

  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  if (session.isPending || guard.status === "checking") {
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

  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Opening your account…
      </main>
    );
  }

  if (guard.status === "forbidden") {
    return hasRole(guard.user, PARTNER_ROLE) ? (
      <SwitchToPartner />
    ) : (
      <NoPartnerAccess onSignOut={() => logout.mutate()} />
    );
  }

  const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
  const workspaceKeys = workspaces.map((item) => item.key);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      <div className="relative flex min-h-screen w-full max-w-md flex-col border-x border-line/50 bg-surface shadow-sm">
        {chromeMode === "full" ? (
          <header className="sticky top-0 z-30 border-b border-line bg-surface">
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                href="/home"
                className="flex items-center gap-2 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                <Logo className="h-7 w-auto" />
                <span className="text-sm font-semibold text-text-secondary">Partner</span>
              </Link>
              <Button
                variant="ghost"
                onClick={() => logout.mutate()}
                loading={logout.isPending}
                loadingLabel="Signing out"
              >
                Sign Out
              </Button>
            </div>
          </header>
        ) : chromeMode === "focused" ? (
          <FocusedHeader pathname={pathname} />
        ) : null}

        <ShellContent paddingBottom={chromeMode === "full" ? "pb-20" : "pb-6"}>
          {children}
        </ShellContent>

        {chromeMode === "full" ? (
          <BottomTabBar items={TAP_FIRST_NAV} workspaceKeys={workspaceKeys} />
        ) : null}

        {hasRole(guard.user, PARTNER_ROLE) ? <LiveOfferSheet /> : null}
      </div>
    </div>
  );
}

function BottomTabBar({
  items,
  workspaceKeys,
}: {
  items: readonly WorkspaceNavItem[];
  workspaceKeys: readonly string[];
}) {
  const pathname = usePathname();

  const current = items.reduce<{ href: string; owned: string } | null>((best, item) => {
    if (item.kind === "notifications") return best;
    const owned = item.activePrefix ?? item.href;
    const matches = pathname === owned || pathname.startsWith(`${owned}/`);
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: item.href, owned } : best;
  }, null);
  const currentHref = current?.href ?? null;

  return (
    <nav
      aria-label="Partner navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
    >
      <div className="mx-auto max-w-md">
        <ul className="flex list-none justify-around p-0">
          {items.map((item) => {
            if (item.kind === "notifications") {
              return (
                <li key={item.href} className="flex-1">
                  <NotificationNavTab workspaceKeys={workspaceKeys} label={item.label} />
                </li>
              );
            }

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
                    <Icon size={20} strokeWidth={isCurrent ? 2.5 : 2} aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function ShellContent({
  children,
  paddingBottom = "pb-20",
}: {
  children: ReactNode;
  paddingBottom?: string;
}) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(pathname);

  useEffect(() => {
    if (pathname === mountedAt.current) return;
    contentRef.current?.focus();
  }, [pathname]);

  return (
    <div ref={contentRef} tabIndex={-1} className={cn("flex-1 outline-none", paddingBottom)}>
      {children}
    </div>
  );
}
