"use client";

import { hasRole, useAuthGuard, useCurrentSession, useLogout, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, Spinner, cn } from "@vsolve/ui";
import { ArrowLeft, Bell, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ApiRequestError } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import { prepareBookingAlertsFromGesture } from "@/features/notifications/view/booking-alert-audio";
import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { NotificationNavTab } from "@/features/notifications/view/notification-bell";
import { NotificationPanel } from "@/features/notifications/view/notification-panel";
import { useUnreadNotificationCount } from "@/features/notifications/queries";
import { usePartnerApplication } from "@/features/application/queries";
import { homeForApplication } from "@/features/session/model/redirect";
import {
  resolveWorkspaces,
  TAP_FIRST_NAV,
  RENTAL_NAV,
  RENTAL_WORKSPACE,
  STAY_NAV,
  STAY_WORKSPACE,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

export const PARTNER_ROLE = "partner";

export type PartnerChromeMode = "full" | "focused" | "onboarding";

/**
 * Route chrome policy for Partner application:
 * - "full": persistent header + BottomTabBar on /home, /work/all, /money, /me, /me/*, /rentals/*
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
    pathname.startsWith("/me/") ||
    pathname === "/rentals" ||
    pathname.startsWith("/rentals/") ||
    pathname === "/stays" ||
    pathname.startsWith("/stays/")
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
          onPointerDown={() => prepareBookingAlertsFromGesture()}
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
  } else if (pathname.endsWith("/arrival")) {
    // Before the `/work/enquiries` branch: every arrival route is nested under
    // it, and the longest match is the one that names the screen you are on.
    title = "Arrival code";
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
        {/*
          The trailing slot. It was a spacer holding the title centred; it still
          is, and a detail screen may now portal one control into it — the
          enquiry chat does. The shell deliberately does not know what: it owns
          the header's shape, not any feature's actions.
        */}
        <div id="partner-header-action" className="flex h-11 w-11 items-center justify-center" />
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

  const logout = useLogout(getApiClient());
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";
  const chromeMode = getPartnerChromeMode(pathname);

  /*
    Holding the `partner` role is not the same as being allowed into the portal.

    Django grants that role when an application is **created**, not when it is
    approved — `ApplyGuard` and `app/home/page.tsx` both say so, and it is why
    neither of them requires the role. The consequence nobody had followed
    through: `requirePartnerRole` is satisfied by a DRAFT applicant, so every
    route carrying it — `/work/*`, `/money`, `/me/*` — opened to someone who had
    not finished applying. They were shown "Nothing here yet" over an empty work
    stack (indistinguishable from an approved Partner having a quiet day), a
    "Verified" badge, and a control offering to put them online for work the
    server will refuse to send them.

    It also spent eight portal reads per visit — `crew-offers`, `offers`,
    `enquiries`, `engagements`, `bookings` twice, `workspaces`, `unread-count` —
    plus `LiveOfferSheet`'s fifteen-second crew-offer poll, on an account that
    cannot hold any of it.

    Approval is read here and the two existing rules are reused rather than
    restated: **approved** is `status === "APPROVED"`, the same test `WorkHome`
    already gates the work stack on, and **where they belong instead** is
    `homeForApplication`, which login already uses. No new policy — the answers
    this app already gives, applied to the routes that were missing them.
  */
  const needsApproval = requirePartnerRole;
  const application = usePartnerApplication({
    enabled:
      guard.status === "authenticated" &&
      hasRole(guard.user, PARTNER_ROLE) &&
      (needsApproval || chromeMode === "full"),
  });
  // A 404 is the answer "no application exists", not a failure to wait on.
  const applicationMissing =
    application.error instanceof ApiRequestError && application.error.status === 404;
  /*
    Any other error means we do not know the status, which is different from
    knowing it is unapproved. Redirecting on a dropped connection would eject an
    approved Partner mid-job to `/apply` and tell them to finish an application
    they finished months ago — so an unknown answer draws the retry below and
    stays put instead.
  */
  const applicationUnknown = application.isError && !applicationMissing;
  const applicationSettled =
    !application.isPending || applicationMissing || applicationUnknown;
  const applicationStatus = applicationMissing ? null : application.data?.status ?? null;
  const isApprovedPartner = applicationStatus === "APPROVED";
  const mustLeavePortal =
    needsApproval && applicationSettled && !applicationUnknown && !isApprovedPartner;

  /*
    Grants are read only to label the dock, which now renders for approved
    Partners alone — so an unapproved applicant no longer spends a
    `/partner/workspaces/` read on a bar they will never be shown.
  */
  const workspaceGrants = usePartnerWorkspaceGrants({
    enabled: guard.status === "authenticated" && isApprovedPartner,
  });

  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  useEffect(() => {
    if (!mustLeavePortal) return;
    // `homeForApplication` sends DRAFT/CHANGES_REQUIRED to `/apply` and every
    // other unapproved state to `/home`. Neither destination sets
    // `requirePartnerRole`, so this cannot bounce.
    router.replace(homeForApplication(applicationStatus));
  }, [applicationStatus, mustLeavePortal, router]);

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

  /*
    Both of these return before `children`, which is the point: a portal screen
    that mounted and then redirected would still have fired its whole query set
    on the way past. Waiting here is what stops the eight reads described above
    from ever being sent.
  */
  if (needsApproval && !applicationSettled) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Checking your access…
      </ShellMessage>
    );
  }

  if (needsApproval && applicationUnknown) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title="We could not check your account"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void application.refetch()}
        />
      </main>
    );
  }

  if (mustLeavePortal) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Taking you to your application…
      </ShellMessage>
    );
  }

  const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
  const workspaceKeys = workspaces.map((item) => item.key);
  const hasRentalWorkspace = workspaceKeys.includes(RENTAL_WORKSPACE);
  const isRentalRoute = pathname === "/rentals" || pathname.startsWith("/rentals/");
  const isRental = hasRentalWorkspace || isRentalRoute;

  const hasStayWorkspace = workspaceKeys.includes(STAY_WORKSPACE);
  const isStayRoute = pathname === "/stays" || pathname.startsWith("/stays/");
  const isStay = hasStayWorkspace || isStayRoute;

  const navItems = isStay ? STAY_NAV : isRental ? RENTAL_NAV : TAP_FIRST_NAV;
  const isDarkHero = (pathname === "/home" && !isRental && !isStay) || pathname === "/work";

  const user = session.data?.user;
  const defaultName = isStay ? "Host" : isRental ? "Rental Partner" : "Partner";
  const userName = user?.display_name || user?.full_name?.split(" ")[0] || defaultName;
  const fallbackInitial = isStay ? "H" : isRental ? "R" : "P";
  const userInitial = (user?.display_name?.[0] || user?.full_name?.[0] || fallbackInitial).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      {/*
        DESKTOP (`lg:` and up) ONLY — every class below `lg:` is the phone
        layout and is deliberately untouched.

        The signed-in app is a 448px column with a phone dock, which is correct
        on a phone and was being shown unchanged on a 1440px display: a narrow
        strip of content with ~500px of dead grey either side and a thumb-reach
        tab bar floating in the middle of the screen. From `lg:` the column
        becomes a real page width and loses the phone chrome — the simulated
        device edges (`border-x`) and drop shadow that only make sense when the
        column is pretending to be a handset.
      */}
      <div
        className={cn(
          "relative flex min-h-screen w-full max-w-md flex-col border-x border-line/50 shadow-sm",
          // `lg:max-w-none`, not a wider cap. Capping the column at a fixed
          // width left the cream `bg-background` of the parent showing as two
          // gutters down the sides of every screen — the same "floating panel"
          // look the phone frame gave, just wider. The app chrome and the dark
          // home banner now run edge to edge like any desktop application, and
          // line length is controlled where it belongs: on the content inside.
          "lg:max-w-none lg:border-x-0 lg:shadow-none",
          isDarkHero ? "bg-[var(--color-ink-900)]" : "bg-surface",
        )}
      >
        {chromeMode === "full" ? (
          <div className={isDarkHero ? "sticky top-0 z-30 bg-[var(--color-ink-900)]" : "sticky top-0 z-30"}>
            {/*
              DESKTOP ONLY: the phone header keeps its pill corners and heavy
              drop shadow; from `lg:` it becomes a flat page header with a hairline
              rule, and gains the primary navigation inline — see `DesktopPrimaryNav`.
            */}
            <header className="rounded-b-[1.75rem] bg-surface px-4 pb-3 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-[0_4px_24px_rgba(0,0,0,0.12)] lg:rounded-b-none lg:border-b lg:border-line lg:px-8 lg:py-3 lg:shadow-none">
              {/*
                The bar spans the viewport; its contents do not. Without this the
                logo and Sign Out sit against opposite edges of a 2000px display
                with the nav marooned in the middle.
              */}
              <div className="flex items-center justify-between lg:mx-auto lg:w-full lg:max-w-7xl lg:gap-8">
                <Link
                  href="/home"
                  // `min-h-11` (44px) so the home link is a real phone tap
                  // target. The logo itself is 28px tall, which is under every
                  // touch minimum, and this is the only way back to Home from a
                  // "full"-chrome screen other than the dock. The extra height
                  // is padding around the same mark — nothing moves.
                  className="flex min-h-11 min-w-0 items-center gap-2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <Logo className="text-base h-7 w-auto" />
                </Link>

                {isApprovedPartner ? (
                  <DesktopPrimaryNav items={navItems} workspaceKeys={workspaceKeys} />
                ) : null}

                <div className="flex items-center gap-2">
                  <HeaderNotificationBell workspaceKeys={workspaceKeys} />
                  <HeaderUserMenu
                    userName={userName}
                    userInitial={userInitial}
                    onSignOut={() => logout.mutate()}
                    isPending={logout.isPending}
                    roleLabel={isStay ? "Host" : isRental ? "Rental" : "Partner"}
                    workspaceLabel={isStay ? "Stays Host Workspace" : isRental ? "Rental Partner Workspace" : "Partner Workspace"}
                    moneyHref={isStay ? "/stays/money" : isRental ? "/rentals/money" : "/money"}
                  />
                </div>
              </div>
            </header>
          </div>
        ) : chromeMode === "focused" ? (
          <FocusedHeader pathname={pathname} />
        ) : null}

        {/*
          The dock is drawn only for an approved Partner. `/home` is the one
          "full"-chrome route an unapproved applicant still belongs on — it
          renders their application overview — and every destination in
          `TAP_FIRST_NAV` is now gated against them, so drawing it there would
          be four taps that bounce straight back.

          This is the reasoning `ApplyGuard` already gives for why `/apply` does
          not use this shell ("All four point at screens an applicant cannot
          use"), applied to the other screen those applicants can reach. The
          header, and with it Sign Out, is untouched.
        */}
        {/*
          DESKTOP ONLY: `pb-32` is clearance for the fixed phone dock. The dock
          is `lg:hidden`, so from `lg:` that reserved strip would be dead space
          at the foot of every page.
        */}
        <ShellContent
          paddingBottom={
            chromeMode === "full" && isApprovedPartner ? "pb-32 lg:pb-12" : "pb-0 lg:pb-0"
          }
        >
          {children}
        </ShellContent>

        {chromeMode === "full" && isApprovedPartner ? (
          <BottomTabBar items={navItems} workspaceKeys={workspaceKeys} />
        ) : null}

        {/*
          Approval, not the role. This sheet runs `usePartnerCrewOffers` on a
          fifteen-second poll for as long as it is mounted; before this it ran
          for anyone holding the role, which includes every DRAFT applicant —
          polling indefinitely for offers the cascade can never send them.
        */}
        {isApprovedPartner ? <LiveOfferSheet /> : null}
      </div>
    </div>
  );
}

/**
 * The signed-in primary navigation, for `lg:` and up only.
 *
 * DESKTOP ONLY — it is `hidden lg:flex`, and `BottomTabBar` is `lg:hidden`, so
 * exactly one of the two is ever on screen and the phone dock is untouched.
 *
 * ## Why a second component rather than restyling the dock
 *
 * The dock is a curved dark bar with a raised centre Home button and white-on-
 * dark tabs. Every one of those choices is right for a thumb and wrong for a
 * pointer, and re-deriving them behind `lg:` variants would mean editing the
 * classes the phone depends on — which is the one thing this change must not do.
 * Two components reading the same `TAP_FIRST_NAV` array cannot drift on *which*
 * destinations exist; only on how they are drawn, which is the point.
 *
 * `NotificationNavTab` is reused exactly as-is, styling included. It paints
 * white-on-dark for the dock, so it sits here inside a dark pill — which is why
 * that one item looks deliberate rather than inverted. Giving it a `className`
 * prop would have been the tidier seam, but that is a shared component the phone
 * renders too, and this task does not get to touch it.
 */
function DesktopPrimaryNav({
  items,
  workspaceKeys,
}: {
  items: readonly WorkspaceNavItem[];
  workspaceKeys: readonly string[];
}) {
  const pathname = usePathname();

  // Longest owned prefix wins, matching `BottomTabBar` exactly so the two can
  // never disagree about which destination is current.
  const current = items.reduce<{ href: string; owned: string } | null>((best, item) => {
    if (item.kind === "notifications") return best;
    const owned = item.activePrefix ?? item.href;
    const matches =
      pathname === owned ||
      pathname.startsWith(`${owned}/`) ||
      (item.href === "/home" && (pathname === "/stays/home" || pathname === "/rentals/home"));
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: item.href, owned } : best;
  }, null);
  const currentHref = current?.href ?? null;

  return (
    <nav aria-label="Partner navigation" className="hidden lg:flex lg:flex-1 lg:justify-center">
      <ul className="flex list-none items-center gap-1">
        {items.map((item) => {
          if (item.kind === "notifications") {
            return (
              <li key={item.href}>
                <NotificationNavTab
                  workspaceKeys={workspaceKeys}
                  label={item.label}
                  appearance="bar"
                />
              </li>
            );
          }

          const isCurrent = item.href === currentHref;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                onPointerDown={() => prepareBookingAlertsFromGesture()}
                className={cn(
                  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                  isCurrent
                    ? "bg-[#fef3eb] text-[#d9531e] font-bold"
                    : "text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900 font-medium",
                )}
              >
                <Icon
                  size={17}
                  strokeWidth={isCurrent ? 2.4 : 2}
                  className={isCurrent ? "text-[#d9531e]" : "text-neutral-500"}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HeaderNotificationBell({ workspaceKeys }: { workspaceKeys: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const count = useUnreadNotificationCount();
  const unread = count.isSuccess && count.data !== undefined ? count.data.unread : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors focus-visible:outline-none"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-[#f97316] ring-2 ring-white" />
      </button>
      <NotificationPanel
        open={open}
        onOpenChange={setOpen}
        workspaceKeys={workspaceKeys}
        unreadCount={unread}
      />
    </>
  );
}

function HeaderUserMenu({
  userName,
  userInitial,
  onSignOut,
  isPending,
  roleLabel = "Partner",
  workspaceLabel = "Partner Workspace",
  moneyHref = "/rentals/money",
}: {
  userName: string;
  userInitial: string;
  onSignOut: () => void;
  isPending: boolean;
  roleLabel?: string;
  workspaceLabel?: string;
  moneyHref?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-neutral-100 transition-colors focus-visible:outline-none"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e293b] text-white font-bold text-sm shadow-xs">
          {userInitial}
        </div>
        <div className="hidden sm:flex flex-col text-left leading-tight">
          <span className="text-sm font-bold text-neutral-900">{userName}</span>
          <span className="text-[11px] font-medium text-neutral-400">{roleLabel}</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-500 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-neutral-200/80 bg-white p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-2 border-b border-neutral-100 mb-1">
            <div className="text-xs font-bold text-neutral-900">{userName}</div>
            <div className="text-[11px] text-neutral-500">{workspaceLabel}</div>
          </div>
          <Link
            href="/me"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Profile &amp; Account
          </Link>
          <Link
            href={moneyHref}
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Earnings &amp; Deposits
          </Link>
          <div className="my-1 border-t border-neutral-100" />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setIsOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
          >
            {isPending ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      )}
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
    const matches =
      pathname === owned ||
      pathname.startsWith(`${owned}/`) ||
      (item.href === "/home" && (pathname === "/stays/home" || pathname === "/rentals/home"));
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: item.href, owned } : best;
  }, null);
  const currentHref = current?.href ?? null;

  const homeItem = items.find((item) => item.href === "/home" || item.label === "Home");
  const sideItems = items.filter((item) => item.href !== "/home" && item.label !== "Home");
  const midPoint = Math.ceil(sideItems.length / 2);
  const leftItems = sideItems.slice(0, midPoint);
  const rightItems = sideItems.slice(midPoint);

  function renderTab(item: WorkspaceNavItem) {
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
          onPointerDown={() => prepareBookingAlertsFromGesture()}
          className={cn(
            "relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 text-[0.625rem] font-semibold leading-none tracking-wide transition-all",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action",
            isCurrent ? "text-white font-bold" : "text-white/45 hover:text-white/70",
          )}
        >
          {isCurrent ? (
            <span
              aria-hidden
              className="absolute -top-1 h-0.5 w-6 rounded-full bg-signal-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"
            />
          ) : null}
          <span className="flex items-center justify-center">
            <Icon size={22} strokeWidth={isCurrent ? 2.5 : 1.8} aria-hidden />
          </span>
          <span>{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <nav
      aria-label="Partner navigation"
      // DESKTOP ONLY: `lg:hidden`. The same destinations are rendered inline in
      // the header by `DesktopPrimaryNav` from `lg:` up — a thumb dock pinned to
      // the bottom of a 1440px display is reaching for a thumb that is not there.
      // Everything else about this bar is the phone design, unchanged.
      className="fixed inset-x-0 bottom-0 z-40 bg-transparent lg:hidden"
    >
      <div className="mx-auto max-w-md relative">
        {homeItem ? (
          <div className="absolute inset-x-0 -top-6 z-50 mx-auto flex w-full justify-center pointer-events-none">
            <Link
              href={homeItem.href}
              aria-label="Home"
              aria-current={currentHref === homeItem.href ? "page" : undefined}
              onPointerDown={() => prepareBookingAlertsFromGesture()}
              className={cn(
                "pointer-events-auto flex size-[4.25rem] items-center justify-center rounded-full",
                "bg-[linear-gradient(135deg,var(--color-action-active)_0%,var(--color-action-active)_100%)] shadow-[0_8px_32px_color-mix(in_oklab,var(--color-action-active)_40%,transparent)]",
                "text-action-text focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-action transition-transform hover:scale-105 active:scale-95",
              )}
            >
              <homeItem.icon size={26} strokeWidth={2.5} aria-hidden />
            </Link>
          </div>
        ) : null}

        {/* Main bar */}
        <div className="rounded-t-[1.75rem] bg-[var(--color-ink-900)] px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_40px_color-mix(in_oklab,var(--color-ink-900)_50%,transparent)]">
          <div className="flex w-full items-end">
            <ul className="flex flex-1 list-none items-end justify-around">
              {leftItems.map(renderTab)}
            </ul>
            <div aria-hidden className="w-[72px] shrink-0" />
            <ul className="flex flex-1 list-none items-end justify-around">
              {rightItems.map(renderTab)}
            </ul>
          </div>
        </div>
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
