"use client";

// The namespace import is load-bearing: `PATHS`/`MOBILE_PATHS` name `React.ReactNode`,
// and the test runner's JSX transform resolves elements through the `React` binding.
import * as React from "react";
import { useState, useEffect } from "react";
import { useLogout, useAuthGuard, usePhoneAuthFlow } from "@vsolve/query";
import { Button, Logo, Dialog, OtpForm, cn, useHydrated } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { NotificationBell } from "@/features/notifications/view/notification-bell";
import { readPendingReferral } from "@/features/referral/pending-referral";
import { getApiClient } from "@/lib/api/browser";
import { useCart } from "@/features/checkout/queries";

import { useCustomerSession } from "../queries";
import { ProfileMark, profileName } from "./profile-mark";
import { CUSTOMER_VIEWPORT_WIDTH_CLASS } from "./app-chrome-layout";

/**
 * The Customer app's top bar.
 */
export function SiteHeader() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const pathname = usePathname();
  const router = useRouter();

  const hydrated = useHydrated();
  const cartQuery = useCart();
  // Zero until hydrated: the server has no cart, so a badge on the first client render
  // would not match the server's HTML.
  const cartCount = hydrated
    ? (cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0)
    : 0;

  // Global login dialog state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const guard = useAuthGuard(getApiClient());
  const flow = usePhoneAuthFlow(getApiClient(), {
    getReferralCode: readPendingReferral,
    onAuthenticated: () => {
      setIsLoginOpen(false);
      router.refresh();
    },
  });

  // Listen to custom window event to trigger login popup from other parts of the app
  useEffect(() => {
    const handleOpen = () => setIsLoginOpen(true);
    window.addEventListener("open-login-popup", handleOpen);
    return () => window.removeEventListener("open-login-popup", handleOpen);
  }, []);

  const loginDialogOpen = hydrated && isLoginOpen && guard.status !== "authenticated";
  const sessionKnown = hydrated && !session.isResolving;

  const handleOpenChange = (open: boolean) => {
    setIsLoginOpen(open);
    if (!open) {
      flow.reset();
    }
  };

  const targets = NAV_TARGETS.filter(
    (target) => !target.private || (sessionKnown && session.isAuthenticated),
  );

  return (
    <header className={cn(
      CUSTOMER_VIEWPORT_WIDTH_CLASS,
      "sticky top-0 z-20 transition-colors",
      pathname === "/"
        ? "bg-[#FAF9F7] md:bg-surface md:border-b md:border-line"
        : pathname.match(/^\/catalog\/[^/]+$/)
          ? "hidden md:block bg-surface border-b border-line"
          : "bg-surface border-b border-line"
    )}>
      {/* Desktop Header Layout */}
      <div className="hidden md:flex mx-auto min-h-16 w-full max-w-[1216px] items-center gap-x-7 px-4 py-3 sm:px-6 lg:px-0">
        <Link href="/" aria-label="V Solve Hub home" className="shrink-0">
          <Logo className="h-7 w-auto" />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-x-1 md:flex">
          {targets.map((target) => {
            const current = isCurrentTarget(target.href, pathname);
            return (
              <Link
                key={target.href}
                href={target.href}
                aria-current={current ? "page" : undefined}
                onClick={(e) => {
                  if (target.href === "/activity" && !session.isAuthenticated) {
                    e.preventDefault();
                    setIsLoginOpen(true);
                  }
                }}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-control px-3.5 text-sm",
                  "transition-colors duration-fast",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  current
                    ? "bg-action-surface font-extrabold text-text"
                    : "font-semibold text-text-secondary hover:bg-surface-hover hover:text-text",
                )}
              >
                {target.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side actions on desktop */}
        <div className="flex items-center gap-3">
          {/* Desktop had no way to search from anywhere but the catalogue page itself. */}
          <Link
            href="/catalog?search=1"
            aria-label="Search services"
            className="flex size-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          {/* Cart Icon Link */}
          <Link
            href="/cart"
            aria-label="View basket"
            title="Basket"
            className={cn(
              "relative flex size-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              isCurrentTarget("/cart", pathname) && "bg-action-surface text-text font-bold"
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EA580C] px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
                {cartCount}
              </span>
            )}
          </Link>

          {!sessionKnown ? null : session.isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell />
              <Link
                href="/account"
                aria-label="Open profile"
                title={profileName(session) ?? "Profile"}
                className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <ProfileMark identity={session} className="size-10 text-xs" />
              </Link>
              <Button
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => {
                      router.replace("/login");
                      router.refresh();
                    },
                  })
                }
                loading={logout.isPending}
                loadingLabel="Signing out"
              >
                Sign out
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="text-sm font-semibold text-text-link hover:underline cursor-pointer bg-transparent border-none p-0 focus:outline-none"
            >
              Log in
            </button>
          )}
        </div>
      </div>

      {/* Mobile Header Layout */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 min-h-16 w-full gap-2">
        <Link href="/" aria-label="V Solve Hub home" className="shrink-0">
          <Logo className="h-7 w-auto" />
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            aria-label="View basket"
            // 44px: the thumb-sized minimum; this is the only way to the cart on a phone.
            className="relative flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-4.5">
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#EA580C] px-0.5 text-[8px] font-extrabold text-white ring-1.5 ring-[#FAF9F7]">
                {cartCount}
              </span>
            )}
          </Link>
          {!sessionKnown ? null : session.isAuthenticated ? (
            <>
              <NotificationBell />
              <Link
                href="/account"
                aria-label="Open profile"
                className="flex size-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <ProfileMark identity={session} className="size-8.5 text-xs" />
              </Link>
            </>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="inline-flex min-h-11 items-center rounded-full border border-[#EA580C]/40 px-4 text-sm font-bold text-[#EA580C] hover:text-[#C2410C] cursor-pointer bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]"
            >
              Log in
            </button>
          )}
        </div>
      </div>

      {/* Global Interactive Login Dialog Modal */}
      {hydrated ? (
      <Dialog
        open={loginDialogOpen}
        onOpenChange={handleOpenChange}
        title="Log in to V Solve Hub"
        description="Verify your mobile number to view bookings and checkout"
        // Firebase phone login can raise a reCAPTCHA picture challenge, which
        // has to sit above this dialog to be solved.
        topLayer={false}
      >
        <div className="py-2 flex flex-col gap-4">
          <Logo className="h-8 w-auto self-start" />
          <p className="text-xs text-text-secondary">
            Use the mobile number you book with. We will text you a code — there is no password.
          </p>
          <OtpForm
            {...flow}
            heading="Your mobile number"
            headingLevel={2}
            description="We will text you a code. There is no password."
            verifyLabel="Verify and continue"
          />
        </div>
      </Dialog>
      ) : null}
    </header>
  );
}

export interface NavTarget {
  href: string;
  label: string;
  shortLabel: string;
  icon: "home" | "activity" | "basket";
  private: boolean;
}

export const NAV_TARGETS: readonly NavTarget[] = [
  // Deliberately first and deliberately public: the catalog and the anonymous
  // basket are real surfaces for somebody who has never signed in.
  { href: "/catalog", label: "Services", shortLabel: "Services", icon: "home", private: false },
  // A7 Equipment & Tool Rentals
  { href: "/rentals", label: "Rentals", shortLabel: "Rentals", icon: "activity", private: false },
  // A9 PG, Rooms & Hotels Stays
  { href: "/stays", label: "Stays", shortLabel: "Stays", icon: "home", private: false },
  // A10 Career/Jobs — listing surface, not the area-priced Services catalogue.
  { href: "/listings", label: "Careers", shortLabel: "Careers", icon: "activity", private: false },
  { href: "/activity", label: "Bookings", shortLabel: "Bookings", icon: "activity", private: true },
];

/**
 * The paths each target owns, beyond its own href.
 *
 * `/catalog` owns the shopping flow: a visitor moving from the catalogue into
 * the basket and on to checkout has not left "Services", and a nav that lights
 * nothing there has stopped answering "where am I".
 */
const OWNED: Record<string, readonly string[]> = {
  "/catalog": ["/catalog", "/book", "/cart", "/checkout"],
  "/rentals": ["/rentals"],
  "/stays": ["/stays"],
  "/listings": ["/listings"],
  "/activity": ["/activity", "/bookings", "/requests", "/projects", "/engagements"],
};

/**
 * Whether `pathname` is inside `href`'s territory.
 */
export function isCurrentTarget(href: string, pathname: string): boolean {
  const owned = OWNED[href] ?? [href];
  return owned.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * The three navigation glyphs, drawn.
 */
export function NavIcon({ name, className }: { name: NavTarget["icon"]; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<NavTarget["icon"], React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  activity: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h6" />
    </>
  ),
  basket: (
    <>
      <path d="M4 8h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
};

interface MobileNavTarget {
  href: string;
  label: string;
  shortLabel: string;
  icon: "home" | "search" | "cart" | "activity" | "profile";
  private: boolean;
}

const MOBILE_TARGETS: readonly MobileNavTarget[] = [
  { href: "/", label: "Home", shortLabel: "Home", icon: "home", private: false },
  { href: "/catalog", label: "Services", shortLabel: "Services", icon: "search", private: false },
  { href: "/cart", label: "Cart", shortLabel: "Cart", icon: "cart", private: false },
  { href: "/activity", label: "Bookings", shortLabel: "Bookings", icon: "activity", private: false },
  { href: "/account", label: "Profile", shortLabel: "Profile", icon: "profile", private: true },
];

const MOBILE_PATHS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  cart: (
    <>
      <path d="M4 8h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  activity: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </>
  ),
  profile: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
};

function NavIconMobile({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {MOBILE_PATHS[name]}
    </svg>
  );
}

export function BottomNav() {
  const session = useCustomerSession();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const cartQuery = useCart();
  const cartCount = hydrated
    ? (cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0)
    : 0;

  const targets = MOBILE_TARGETS.filter(
    (target) => !target.private || session.isAuthenticated,
  );

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 overflow-visible md:hidden",
        "border-t border-line/80 bg-[#FAF9F7] pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-4px_16px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex min-h-16 w-full items-center px-1 py-2">
        {targets.map((target) => {
          const current = isCurrentTarget(target.href, pathname);
          return (
            <Link
              key={target.href}
              href={target.href}
              aria-current={current ? "page" : undefined}
              onClick={(e) => {
                if (target.href === "/activity" && !session.isAuthenticated) {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("open-login-popup"));
                } else if (target.href === "/account" && !session.isAuthenticated) {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("open-login-popup"));
                }
              }}
              className={cn(
                "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-0.5",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
              )}
              aria-label={target.label}
            >
              <span
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  current
                    ? "bg-action text-white shadow-sm"
                    : "text-text-secondary group-hover:text-navy-900",
                )}
              >
                <NavIconMobile name={target.icon} className="size-[1.125rem]" />
                {target.icon === "cart" && cartCount > 0 ? (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 grid min-w-4 h-4 place-items-center rounded-full px-1 text-[9px] font-black leading-none shadow-xs",
                      current ? "bg-navy-900 text-white" : "bg-action text-white",
                    )}
                  >
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[10px] leading-none",
                  current ? "font-bold text-action" : "font-semibold text-text-secondary",
                )}
              >
                {target.shortLabel}
              </span>
            </Link>
          );
        })}

        {session.isResolving || session.isAuthenticated ? null : (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-login-popup"))}
            className={cn(
              "flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-none bg-transparent p-0",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
            )}
            aria-label="Log in"
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-text-secondary transition-colors hover:text-navy-900">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[1.125rem]"
              >
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
                <path d="M10 16l4-4-4-4M14 12H3.5" />
              </svg>
            </span>
            <span className="max-w-full truncate text-[10px] font-semibold leading-none text-text-secondary">
              Log in
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
