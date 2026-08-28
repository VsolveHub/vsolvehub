"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, useOtpFlow } from "@vsolve/query";
import { Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import { HelpCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { usePartnerApplication } from "@/features/application/queries";
import { prepareBookingAlertsFromGesture } from "@/features/notifications/view/booking-alert-audio";
import { getApiClient } from "@/lib/api/browser";

import { homeForApplication, safeNextPath } from "../model/redirect";

/**
 * The one OTP surface for the whole Partner app.
 *
 * There were three before this — inside onboarding, inside offers and inside
 * availability — each on a URL that described a page the person could not see.
 * Signing in on `/offers` left the browser at `/offers` showing a phone field,
 * so there was nothing to return *to* and no way to link anyone into the product
 * from the marketing site. Login is a place now.
 *
 * ## Where it sends people
 *
 * A validated `?next=` wins, so a deep link survives an expired cookie. With
 * nothing to return to, the destination depends on the application: `/apply`
 * while there is still work for them there, the home otherwise. Both decisions
 * live in `../model/redirect` — the `?next=` half is a security boundary and is
 * tested as one.
 */
const NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/benefits", label: "Earnings & Benefits" },
  { href: "/trades", label: "Trades & Services" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Payout Rates" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Support" },
];

import Link from "next/link";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { MarketingNavCta } from "@/components/marketing-nav-cta";

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guard = useAuthGuard(getApiClient());
  const isAuthenticated = guard.status === "authenticated";

  // Only once there is a session. Asking Django for an application while nobody
  // is signed in spends a guaranteed refusal on every visit to this screen.
  const application = usePartnerApplication({ enabled: isAuthenticated });
  const flow = useOtpFlow(getApiClient());
  const flowWithAudio = {
    ...flow,
    onRequestCode: () => {
      prepareBookingAlertsFromGesture();
      flow.onRequestCode();
    },
    onVerifyCode: () => {
      prepareBookingAlertsFromGesture();
      flow.onVerifyCode();
    },
  };

  const next = safeNextPath(searchParams.get("next"));

  // A 404 is an answer — "you have never applied" — not a failure to wait on.
  const isMissing =
    application.error instanceof ApiRequestError && application.error.status === 404;
  const knowsWhereToGo = !application.isPending || isMissing;

  useEffect(() => {
    if (!isAuthenticated) return;

    if (next) {
      router.replace(next);
      return;
    }

    if (!knowsWhereToGo) return;
    router.replace(homeForApplication(application.data?.status ?? null));
  }, [application.data?.status, isAuthenticated, knowsWhereToGo, next, router]);

  if (guard.status === "checking") {
    return (
      <main className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-4 py-32 text-text-secondary">
        <Spinner size="sm" />
        Checking your session…
      </main>
    );
  }

  if (guard.status === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-32">
        <ErrorState
          title="We could not check your session"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-4 py-32 text-text-secondary">
        <Spinner size="sm" />
        Taking you to your account…
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-text relative">
      {/* Floating Dynamic-Island Navigation Matching All Screens */}
      <div className="fixed top-3 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <header className="pointer-events-auto mx-auto max-w-6xl rounded-2xl sm:rounded-full bg-white/95 backdrop-blur-2xl border border-line-strong shadow-[0_12px_32px_rgba(0,17,46,0.12),0_1px_3px_rgba(0,0,0,0.05)] px-3.5 sm:px-5 py-2.5 transition-all duration-300">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <Link href="/" className="flex min-h-11 items-center gap-2 group">
                <Logo className="h-6 sm:h-7 w-auto" />
              </Link>

              {/* Live Demand Status Badge */}
              <div className="hidden xl:flex items-center gap-2 rounded-full bg-surface-sunken border border-line px-2.5 py-1 text-[11px]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span className="text-text-secondary font-medium">Daily Bookings:</span>
                <span className="text-navy-900 font-bold">1,400+ Active</span>
              </div>
            </div>

            {/* Desktop Center Navigation Capsule */}
            <nav className="hidden lg:flex items-center gap-0.5 rounded-full bg-surface-sunken/80 border border-line p-1">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  className="px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-navy-900 rounded-full hover:bg-surface transition-all duration-150"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* Right Action CTA & Mobile Drawer */}
            <div className="flex items-center gap-2">
              <MarketingNavCta />
              <MarketingMobileNav items={NAV} />
            </div>
          </div>
        </header>
      </div>

      {/* Page Content */}
      <main className="mx-auto w-full max-w-md px-4 pt-24 sm:pt-28 pb-16">
        <Card className="overflow-hidden p-0 shadow-xl border border-line-strong rounded-3xl bg-surface">
          {/* Header Card Accent */}
          <div className="bg-[#00112e] px-6 py-7 text-white relative overflow-hidden">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 bg-signal-500/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10 mb-3">
                Partner Sign In
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Welcome Back
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                Enter your registered 10-digit mobile number to access your Partner account and job offers.
              </p>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-6 sm:p-7">
            <OtpForm
              {...flowWithAudio}
              heading="Your Mobile Number"
              headingLevel={2}
              // No form-level `description`. `OtpForm` already prints "We will
              // send a 6-digit code by SMS." against the field itself, and the
              // hero above already explains what the number is for — so this
              // slot was a third telling of the same sentence, stacked directly
              // on top of the second. On a 375px screen that pushed the input
              // itself down for no added meaning.
              verifyLabel="Verify & Sign In"
              footer={
                <div className="rounded-2xl bg-surface-sunken p-4 border border-line mt-4">
                  <p className="text-xs leading-relaxed text-text">
                    <strong className="text-navy-900 font-bold">New to V Solve Hub?</strong>{" "}
                    <Link
                      href="/apply"
                      className="inline-flex min-h-11 items-center font-bold text-signal-700 underline underline-offset-4 hover:text-signal-800"
                    >
                      Register as a New Partner
                    </Link>
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Takes only 5 minutes. Free to join with weekly payouts.
                  </p>
                </div>
              }
            />
          </div>
        </Card>

        {/* Helpdesk Contact */}
        <div className="mt-6 text-center">
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-text-muted hover:text-navy-900 transition-colors"
          >
            <HelpCircle size={15} aria-hidden />
            Need help with your phone number or OTP?
          </Link>
        </div>
      </main>
    </div>
  );
}
