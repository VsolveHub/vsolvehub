"use client";

import { hasRole, useAuthGuard, useLogout, useSwitchRole } from "@vsolve/query";
import { Button, ErrorState, Logo, Spinner, cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { DutyProvider } from "@/features/presence/duty-context";
import { AppBar, PushBar } from "@/features/shell/view/app-bar";
import { ConnectionBanner } from "@/features/shell/view/connection-banner";
import { TabBar } from "@/features/shell/view/tab-bar";
import { getApiClient } from "@/lib/api/browser";

export const PARTNER_ROLE = "partner";

export type PartnerChromeMode = "full" | "focused" | "onboarding";

/**
 * The one shell every authenticated Partner screen renders inside.
 *
 * ## The layout, and why it is shaped this way
 *
 * A phone-native column, fluid up to 480px and then centred. Below that it is
 * edge to edge, which is the only correct answer on a 360px Android. Above it,
 * the column stops growing rather than stretching a job card into a 1200px line
 * nobody can scan — but the *page* around it is no longer a bare grey field
 * either: at `lg` the column sits on a tinted ground with a quiet brand rail
 * beside it, so a Partner who opens this on a laptop gets a deliberate desktop
 * page rather than a phone screenshot with margins.
 *
 * The column this replaces was `max-w-md` (448px) with `border-x`, and every
 * screen inside it declared `max-w-2xl` (672px) — a width none of them could
 * ever reach, because the parent capped them 224px earlier. There is one width
 * decision in this app now and it is on the next line.
 *
 * ## Scrolling, and why nothing here is `fixed`
 *
 * The column is a flex container with three children: the app bar, a
 * `min-h-0 flex-1 overflow-y-auto` body, and the tab bar. Only the body
 * scrolls, so the two bars stay put without any positioning — and because they
 * are children of the column they are exactly as wide as the app, needing no
 * `mx-auto max-w-md` of their own. The old bar was `fixed inset-x-0` with a
 * centred list inside it, so on any screen wider than a phone its background
 * ran edge to edge while the app was a strip in the middle.
 *
 * `h-dvh` on the column, **not** `min-h-dvh`, and this is the whole trick.
 * `min-height` is a floor, not a cap: a flex container with `min-h-dvh` grows
 * to fit its content, `flex-1` on the body then resolves against that grown
 * height, the body never overflows, and the *document* scrolls instead — taking
 * both bars off the screen with it. That was measured, not reasoned about: a
 * populated home came out 1796px tall inside an 844px viewport with the scroll
 * container reporting `scrollHeight === clientHeight`. `dvh` rather than `vh`
 * so the collapsing mobile URL bar is accounted for, and `overflow-hidden` on
 * the ground behind it so nothing can scroll the page at all.
 *
 * It also ends the `pb-20` / `calc(100dvh-9rem)` guessing that eleven screens
 * were each doing separately. A flex child does not need to be told how tall
 * its siblings are.
 *
 * ## Safe areas
 *
 * `--safe-top` and `--safe-bottom` are read by the bars themselves
 * (`app-bar.tsx`, `tab-bar.tsx`). Nothing in this app hard-codes an allowance
 * for a notch or a home indicator any more; before this, nothing accounted for
 * either, so on every iPhone since the X the tab labels sat under the gesture
 * bar.
 */

/**
 * Route chrome policy:
 * - `full` — app bar + tab bar. The four tab destinations and their settings tree.
 * - `onboarding` — `/apply/*`. Its own step strip; no tabs, because an applicant
 *   has nothing to navigate between yet.
 * - `focused` — everything else. A back bar and no tabs: a pushed screen ends in
 *   a decision, and a tab bar under a decision is an invitation to abandon it.
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

/**
 * Titles for pushed screens.
 *
 * Still a table, and still not ideal — the right home for a screen's title is
 * the screen — but it is now a table that covers every pushed route this app
 * actually has, matched longest-prefix-first, instead of four prefixes with
 * "Details" as the fallback for everything else. Under the old bar `/me/crew`,
 * `/me/language` and `/me/profile` all announced themselves as "Account".
 *
 * A route with no entry gets a bar with the back control and no title. That is
 * deliberate: an unlabelled bar is honest, a wrong label is not.
 */
const PUSH_TITLES: readonly (readonly [prefix: string, title: string])[] = [
  ["/work/enquiries", "Enquiry"],
  ["/work/offers", "Job offer"],
  ["/work/jobs", "Your job"],
  ["/me/crew", "Your crew"],
  ["/me/language", "Language"],
  ["/me/profile", "Your profile"],
];

function pushTitleFor(pathname: string): string | undefined {
  let best: string | undefined;
  let bestLength = 0;
  for (const [prefix, title] of PUSH_TITLES) {
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
    if (prefix.length <= bestLength) continue;
    best = title;
    bestLength = prefix.length;
  }
  return best;
}

/* --------------------------------------------------------------------------
   Pre-session states. Deliberately outside the column: none of them have tabs,
   a duty pill or anything to scroll, and dressing a refusal in app chrome
   suggests there is an app behind it.
   -------------------------------------------------------------------------- */

function Centred({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-4 px-5 py-10">
      {children}
    </main>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <Centred>
      <p className="flex items-center justify-center gap-2.5 text-body text-text-secondary">
        <Spinner size="sm" />
        {children}
      </p>
    </Centred>
  );
}

export function SwitchToPartner({ inline = false }: { inline?: boolean } = {}) {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  const card = (
    <div className="w-full rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="text-headline text-text">Switch to your Partner account</h2>
      <p className="mt-2 text-body leading-relaxed text-text-secondary">
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

      <div className="mt-5 flex flex-col gap-2.5">
        <Button
          block
          onClick={() => switchRole.mutate(PARTNER_ROLE)}
          loading={switchRole.isPending}
          loadingLabel="Switching"
        >
          Switch to Partner
        </Button>
        <Button variant="ghost" block onClick={() => logout.mutate()}>
          Sign in as someone else
        </Button>
      </div>
    </div>
  );

  return inline ? card : <Centred>{card}</Centred>;
}

function NoPartnerAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Centred>
      <div className="w-full rounded-card border border-line bg-surface p-5 shadow-card">
        <Logo className="h-7 w-auto" />
        <h1 className="mt-5 text-headline text-text">
          You do not have a Partner account
        </h1>
        <p className="mt-2 text-body leading-relaxed text-text-secondary">
          This part of the app is for people who work through Vsolve Hub. Applying
          takes a few minutes and does not commit you to anything.
        </p>
        <Link
          href="/apply"
          className="pv-tap pv-press mt-5 flex h-13 items-center justify-center rounded-control bg-action px-7 text-title text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Become a Partner
        </Link>
        <Button variant="ghost" block className="mt-2.5" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </Centred>
  );
}

export interface PartnerShellProps {
  children: ReactNode;
  requirePartnerRole?: boolean;
}

export function PartnerShell({ children, requirePartnerRole = false }: PartnerShellProps) {
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
  const chromeMode = getPartnerChromeMode(pathname);

  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  if (guard.status === "checking") return <Waiting>Checking your access…</Waiting>;
  if (isUnauthenticated) return <Waiting>Taking you to sign in…</Waiting>;
  if (guard.isSelectingRole) return <Waiting>Opening your account…</Waiting>;

  if (guard.status === "error") {
    return (
      <Centred>
        <ErrorState
          title="We could not check your access"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </Centred>
    );
  }

  if (guard.status === "forbidden") {
    return hasRole(guard.user, PARTNER_ROLE) ? (
      <SwitchToPartner />
    ) : (
      <NoPartnerAccess onSignOut={() => logout.mutate()} />
    );
  }

  const isPartner = hasRole(guard.user, PARTNER_ROLE);

  return (
    /*
      `DutyProvider` wraps the whole authenticated tree rather than the screens
      that show a duty control, because the app bar's indicator is one of those
      screens' consumers and it renders above them. One provider means one
      heartbeat, one restore probe and one stored session id — see the
      provider's own note on the two-copies problem this ends.
    */
    <DutyProvider>
      <div className="h-dvh overflow-hidden bg-canvas lg:bg-navy-900">
        {/* The desktop ground. A brand plate behind a phone column, visible only
            once there is room for it — never a second layout to maintain. */}
        <DesktopBackdrop />

        <div
          className={cn(
            "relative mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas",
            // The column reads as a device once it is not the whole screen.
            "lg:shadow-overlay",
          )}
        >
          <ConnectionBanner />

          {chromeMode === "full" ? (
            <AppBar />
          ) : chromeMode === "focused" ? (
            <PushBar title={pushTitleFor(pathname)} />
          ) : null}

          <ShellScroll>{children}</ShellScroll>

          {chromeMode === "full" ? <TabBar /> : null}

          {/* Offers arrive whatever screen the Partner is on, so the sheet that
              announces them mounts at the shell, not on a route. */}
          {isPartner ? <LiveOfferSheet /> : null}
        </div>
      </div>
    </DutyProvider>
  );
}

/**
 * The scrolling body between the two bars.
 *
 * `min-h-0` is what makes the flex column actually scroll rather than growing
 * past the viewport and taking the tab bar with it — without it a long list
 * pushes `sticky bottom-0` off the bottom of the page, which looks exactly like
 * the tab bar disappearing at the moment a Partner scrolls to find it.
 *
 * Focus moves here on navigation so a screen reader and a keyboard both land at
 * the top of the new screen rather than at the top of the unchanged chrome.
 * Carried over unchanged from the shell this replaces.
 */
function ShellScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(pathname);

  useEffect(() => {
    if (pathname === mountedAt.current) return;
    contentRef.current?.focus();
    /* A tab switch that keeps the previous screen's scroll offset lands a
       Partner halfway down a list they have not seen. */
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div
      ref={contentRef}
      tabIndex={-1}
      className="pv-scroll min-h-0 flex-1 overflow-y-auto outline-none"
    >
      {children}
    </div>
  );
}

/**
 * What sits behind the column on a large screen.
 *
 * ## Positioned against the column, not against the page
 *
 * The column is centred in the **viewport**, so anything beside it has to be
 * measured from the viewport centre or it will not line up. The first attempt
 * here was a `max-w-6xl` row with `justify-between` and a 480px spacer standing
 * in for the column — at 1280px that put the spacer at 736–1216px while the
 * column was at 400–880px, so the "balancing" spacer balanced nothing and the
 * text block ran under the app. `pr-[calc(50%+15rem)]` is the honest version:
 * half the viewport plus half the column is exactly the column's left edge.
 *
 * Gated at `xl` rather than `lg`. At 1024px the space left over beside a 480px
 * column is about 270px, which is not a column of prose — it is a squeezed one,
 * and a squeezed one looks worse than none. Below `xl` the ground is a plain
 * tinted field, which is a deliberate and finished-looking thing to be.
 *
 * Purely decorative and marked as such: everything it says is said again inside
 * the column, and `pointer-events-none` keeps it from stealing a click meant
 * for the app.
 */
function DesktopBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 hidden xl:block">
      <div className="flex h-full items-center pl-10 pr-[calc(50%+15rem)] 2xl:pl-20">
        <div className="max-w-sm">
          <Logo className="h-9 w-auto" />
          <p className="mt-7 text-3xl font-extrabold leading-tight text-surface">
            Your work,
            <br />
            your day,
            <br />
            your money.
          </p>
          <p className="mt-4 text-body leading-relaxed text-navy-200">
            Vsolve Hub for Partners. Built for the phone in your pocket — this is
            the same app, on a bigger screen.
          </p>
        </div>
      </div>
    </div>
  );
}
