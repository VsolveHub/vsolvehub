"use client";

import { hasRole, useAuthGuard, useCurrentSession, useLogout, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, Spinner, cn, useT } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { ApiRequestError } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import { prepareBookingAlertsFromGesture } from "@/features/notifications/view/booking-alert-audio";
import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { NotificationNavTab } from "@/features/notifications/view/notification-bell";
import { usePartnerApplication } from "@/features/application/queries";
import { homeForApplication } from "@/features/session/model/redirect";
import {
  dockNavFor,
  primaryShellNavFor,
  resolveWorkspaces,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

import { PartnerHeaderTitleProvider } from "./partner-header-title";
import { DesktopMobileHandoff } from "./view/desktop-mobile-handoff";
import { translateNavLabel } from "@/features/workspace/nav-labels";

export const PARTNER_ROLE = "partner";

export type PartnerChromeMode = "full" | "focused" | "onboarding";

/**
 * Route chrome policy for Partner application:
 * - "full": persistent header + BottomTabBar on /home, /work/all, /listings,
 *   /money, /me, /me/*
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
    pathname === "/listings" ||
    withinTree(pathname, "/rentals") ||
    withinTree(pathname, "/stays") ||
    pathname === "/money" ||
    pathname === "/me" ||
    pathname.startsWith("/me/")
  ) {
    return "full";
  }
  return "focused";
}

/**
 * `pathname` is `base` or a route inside it.
 *
 * A bare `startsWith("/stays")` also matches `/stays-archive`, which would give
 * a stranger's route the dock. The trailing slash is what makes it a boundary.
 * `/listings` is deliberately left out of this helper: its detail route
 * (`/listings/{id}`) is "focused" on purpose, because the dock over an
 * applicant inbox is the one thing that page does not need.
 */
function withinTree(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function ShellMessage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
      {children}
    </main>
  );
}

export function SwitchToPartner({ inline = false }: { inline?: boolean } = {}) {
  const t = useT();
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  const card = (
    <Card className="w-full max-w-md p-6">
      <h2 className="text-lg font-bold text-text">{t("shell.switchToPartner.title")}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{t("common.differentRoleMessage")}</p>

      {switchRole.isError ? (
        <ErrorState
          inline
          className="mt-4"
          title={t("common.couldNotSwitchRole")}
          message={t("common.couldNotSwitchRoleMessage")}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onPointerDown={() => prepareBookingAlertsFromGesture()}
          onClick={() => switchRole.mutate(PARTNER_ROLE)}
          loading={switchRole.isPending}
          loadingLabel={t("common.switchingToPartner")}
        >
          {t("common.switchToPartner")}
        </Button>
        <Button variant="ghost" onClick={() => logout.mutate()}>
          {t("common.signInAsSomeoneElse")}
        </Button>
      </div>
    </Card>
  );

  if (inline) return card;

  return <main className="mx-auto flex w-full max-w-md px-4 py-16">{card}</main>;
}

function NoPartnerAccess({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  return (
    <main className="mx-auto flex w-full max-w-md px-4 py-16">
      <Card className="w-full p-6">
        <h1 className="text-lg font-bold text-text">{t("common.noPartnerAccountTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{t("common.noPartnerAccountMessage")}</p>
        <Link
          href="/apply"
          className="mt-6 inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          {t("common.becomeAPartner")}
        </Link>
        <Button variant="ghost" className="mt-3" onClick={onSignOut}>
          {t("common.signOut")}
        </Button>
      </Card>
    </main>
  );
}

/**
 * Routes whose own content already renders a title and a way back, so the
 * generic `FocusedHeader` only duplicates it under the fallback title
 * "Details": the job-post wizard needs its own step-aware "Back" (step back,
 * not browser-history back) beside its real title, the day-hire guide has
 * its own "← Work" link and `<h1>`, and every job detail route (`/work/jobs/*`)
 * renders its own hero banner with back navigation and status badge.
 */
export function hasOwnFocusedHeader(pathname: string): boolean {
  return (
    pathname === "/listings/post" ||
    pathname === "/work/how-day-hire-works" ||
    pathname.startsWith("/work/jobs")
  );
}

function FocusedHeader({
  pathname,
  titleOverride,
}: {
  pathname: string;
  titleOverride: string | null;
}) {
  const router = useRouter();
  const t = useT();

  let title = t("common.details");
  if (pathname.startsWith("/work/offers")) {
    title = t("shell.focusedHeader.workOffer");
  } else if (pathname.endsWith("/arrival")) {
    // Before the `/work/enquiries` branch: every arrival route is nested under
    // it, and the longest match is the one that names the screen you are on.
    title = t("shell.focusedHeader.arrivalCode");
  } else if (pathname.startsWith("/work/enquiries")) {
    title = t("shell.focusedHeader.enquiry");
  } else if (pathname.startsWith("/work/jobs")) {
    title = t("shell.focusedHeader.jobDetails");
  } else if (pathname.startsWith("/account") || pathname.startsWith("/me")) {
    title = t("common.account");
  }
  if (titleOverride !== null) title = titleOverride;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("shell.focusedHeader.goBack")}
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
  const t = useT();
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
        {t("common.checkingAccess")}
      </ShellMessage>
    );
  }

  if (isUnauthenticated) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        {t("common.takingYouToSignIn")}
      </ShellMessage>
    );
  }

  if (guard.status === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title={t("common.couldNotCheckAccess")}
          message={t("common.nothingChanged")}
          actionLabel={t("common.tryAgain")}
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        {t("common.openingYourAccount")}
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
        {t("common.checkingAccess")}
      </ShellMessage>
    );
  }

  if (needsApproval && applicationUnknown) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title={t("common.couldNotCheckAccount")}
          message={t("common.nothingChanged")}
          actionLabel={t("common.tryAgain")}
          onAction={() => void application.refetch()}
        />
      </main>
    );
  }

  if (mustLeavePortal) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        {t("common.takingYouToYourApplication")}
      </ShellMessage>
    );
  }

  const workspaces = resolveWorkspaces(workspaceGrants.grants ?? []);
  const workspaceKeys = workspaces.map((item) => item.key);
  const primaryNav = primaryShellNavFor(workspaces);
  const isDarkHero =
    (pathname === "/home" || pathname === "/work" || pathname.startsWith("/work/jobs")) &&
    isApprovedPartner;
  const isRegistrationDocumentsRoute =
    pathname.startsWith("/apply") ||
    pathname.startsWith("/me");

  return (
    <PartnerHeaderTitleProvider>
      {(headerTitle) => (
        <>
          {/*
            DESKTOP ONLY POLICY:
            Per requirements, the partner operations app (jobs, dispatches, live radar,
            wallet, shift) is mobile-only. On desktop screens (lg: and above), only the
            registration process (/apply/*) and application/KYC document reviews
            (/me/documents) are available.
            All other portal routes show the dedicated Desktop Mobile Handoff screen.
          */}
          {!isRegistrationDocumentsRoute ? (
            <div className="hidden lg:flex w-full min-h-screen flex-col">
              <DesktopMobileHandoff
                application={application.data}
                name={application.data?.display_name || guard.user?.full_name || guard.user?.display_name}
                phone={guard.user?.phone_number}
              />
            </div>
          ) : null}

          {/* MOBILE (< lg) AND REGISTRATION DOCUMENTS ON DESKTOP */}
          <div
            className={cn(
              "flex min-h-screen w-full flex-col items-center bg-canvas overflow-x-clip",
              !isRegistrationDocumentsRoute && "lg:hidden",
            )}
          >
            <div
              className={cn(
                "relative flex min-h-screen w-full max-w-md flex-col border-x border-line/50 shadow-sm",
                // On registration documents page, expand on desktop for high-grade responsive layout
                isRegistrationDocumentsRoute && "lg:max-w-none lg:border-x-0 lg:shadow-none",
                isDarkHero ? "bg-[var(--color-ink-900)]" : "bg-canvas",
              )}
            >
              {chromeMode === "full" ? (
                <div className={isDarkHero ? "sticky top-0 z-30 bg-[var(--color-ink-900)]" : "sticky top-0 z-30 bg-surface"}>
                  <header className="rounded-b-[1.75rem] bg-surface px-4 pb-3 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-[0_4px_24px_rgba(0,0,0,0.12)] lg:rounded-b-none lg:border-b lg:border-line lg:px-8 lg:py-3 lg:shadow-none">
                    <div className="flex items-center justify-between lg:mx-auto lg:w-full lg:max-w-7xl lg:gap-8">
                      <Link
                        href="/home"
                        className="flex min-h-11 min-w-0 items-center gap-2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                      >
                        <Logo className="text-base h-7 w-auto" />
                      </Link>

                      {isApprovedPartner && isRegistrationDocumentsRoute ? (
                        <div className="hidden lg:flex items-center gap-2">
                          <span className="text-sm font-bold text-navy-900">
                            {pathname.startsWith("/me/profile") || pathname === "/me"
                              ? "Partner Profile"
                              : "Partner Application & Documents Hub"}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => logout.mutate()}
                          loading={logout.isPending}
                          loadingLabel={t("common.signingOut")}
                        >
                          {t("common.signOut")}
                        </Button>
                      </div>
                    </div>
                  </header>
                </div>
              ) : chromeMode === "focused" && !hasOwnFocusedHeader(pathname) ? (
                <FocusedHeader pathname={pathname} titleOverride={headerTitle} />
              ) : null}

              <ShellContent
                paddingBottom={
                  chromeMode === "full" && isApprovedPartner ? "pb-32 lg:pb-12" : "pb-0 lg:pb-0"
                }
              >
                {children}
              </ShellContent>

              {chromeMode === "full" &&
              isApprovedPartner &&
              pathname !== "/me/documents" &&
              pathname !== "/me/application" &&
              !pathname.startsWith("/apply") ? (
                <BottomTabBar items={primaryNav} workspaceKeys={workspaceKeys} />
              ) : null}

              {isApprovedPartner ? <LiveOfferSheet /> : null}
            </div>
          </div>
        </>
      )}
    </PartnerHeaderTitleProvider>
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
 * Two components reading the same `primaryShellNavFor` array cannot drift on *which*
 * destinations exist; only on how they are drawn, which is the point.
 *
 * `NotificationNavTab` is reused exactly as-is, styling included. It paints
 * white-on-dark for the dock, so it sits here inside a dark pill — which is why
 * that one item looks deliberate rather than inverted. Giving it a `className`
 * prop would have been the tidier seam, but that is a shared component the phone
 * renders too, and this task does not get to touch it.
 */
export function DesktopPrimaryNav({
  items,
  workspaceKeys,
}: {
  items: readonly WorkspaceNavItem[];
  workspaceKeys: readonly string[];
}) {
  const pathname = usePathname();
  const t = useT();

  // Longest owned prefix wins, matching `BottomTabBar` exactly so the two can
  // never disagree about which destination is current.
  const current = items.reduce<{ href: string; owned: string } | null>((best, item) => {
    if (item.kind === "notifications") return best;
    const owned = item.activePrefix ?? item.href;
    const matches = pathname === owned || pathname.startsWith(`${owned}/`);
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: item.href, owned } : best;
  }, null);
  const currentHref = current?.href ?? null;

  return (
    <nav aria-label={t("shell.nav.partnerNavigation")} className="hidden lg:flex lg:flex-1 lg:justify-center">
      <ul className="flex list-none items-center gap-1">
        {items.map((item) => {
          if (item.kind === "notifications") {
            return (
              <li key={item.href}>
                <NotificationNavTab
                  workspaceKeys={workspaceKeys}
                  label={translateNavLabel(t, item.label)}
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
                    ? "bg-surface-sunken text-navy-900"
                    : "text-text-secondary hover:bg-surface-sunken/70 hover:text-navy-900",
                )}
              >
                <Icon size={17} strokeWidth={isCurrent ? 2.4 : 2} aria-hidden />
                {translateNavLabel(t, item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomTabBar({
  items,
  workspaceKeys,
}: {
  items: readonly WorkspaceNavItem[];
  workspaceKeys: readonly string[];
}) {
  const pathname = usePathname();
  const t = useT();

  /*
    The dock is the phone's, so it renders only what fits a thumb: a raised
    centre Home and two slots either side. `desktopOnly` destinations — Stays'
    Enquiries and Bookings, Rentals' Bookings — are left out and reached
    through `SectionNav` inside the workspace instead.

    Filtered before the current-destination pass, not after: `current` is what
    lights a tab, and a `current` pointing at a tab this bar never draws would
    leave the whole dock dark while the partner is plainly inside a section.
  */
  const dockItems = dockNavFor(items);

  const current = dockItems.reduce<{ href: string; owned: string } | null>((best, item) => {
    if (item.kind === "notifications") return best;
    const owned = item.activePrefix ?? item.href;
    const matches = pathname === owned || pathname.startsWith(`${owned}/`);
    if (!matches) return best;
    return best === null || owned.length > best.owned.length ? { href: item.href, owned } : best;
  }, null);
  const currentHref = current?.href ?? null;

  const homeItem = dockItems.find((item) => item.href === "/home" || item.label === "Home");
  const sideItems = dockItems.filter((item) => item.href !== "/home" && item.label !== "Home");
  const midPoint = Math.ceil(sideItems.length / 2);
  const leftItems = sideItems.slice(0, midPoint);
  const rightItems = sideItems.slice(midPoint);

  function renderTab(item: WorkspaceNavItem) {
    if (item.kind === "notifications") {
      return (
        <li key={item.href} className="flex-1">
          <NotificationNavTab workspaceKeys={workspaceKeys} label={translateNavLabel(t, item.label)} />
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
          <span>{translateNavLabel(t, item.label)}</span>
        </Link>
      </li>
    );
  }

  return (
    <nav
      aria-label={t("shell.nav.partnerNavigation")}
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
              aria-label={t("shell.nav.home")}
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
