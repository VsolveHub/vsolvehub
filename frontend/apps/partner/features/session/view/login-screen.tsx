"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, usePhoneAuthFlow } from "@vsolve/query";
import { Card, ErrorState, Logo, OtpForm, Spinner, useHydrated } from "@vsolve/ui";
import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { MarketingNavCta } from "@/components/marketing-nav-cta";
import { HomeHeroLink } from "@/components/home-hero-link";
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
  { href: "/contact", label: "Support" },
];

/**
 * Field errors as sentences.
 *
 * The flow passes Django's field message through unchanged, and for a wrong
 * code that message is currently the bare error code — the screen printed
 * `invalid_otp` under the field. Anything shaped like a machine code is
 * translated here; a real sentence from Django is left as it is.
 */
const FIELD_ERROR_COPY: Record<string, string> = {
  invalid_otp: "That code is not right, or it has expired. Check the code, or request a new one.",
  invalid_phone_number: "Enter a valid 10-digit mobile number.",
};

function readableFieldError(message: string | null | undefined): string | null {
  if (!message) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(message)) return message;
  return FIELD_ERROR_COPY[message] ?? "That did not work. Check what you entered and try again.";
}

function LoginShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-canvas text-text relative">{children}</div>;
}

function LoginWait({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-4 py-32 text-text-secondary">
      <Spinner size="sm" />
      {message}
    </main>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const guard = useAuthGuard(getApiClient());
  const isAuthenticated = guard.status === "authenticated";

  // Only once there is a session. Asking Django for an application while nobody
  // is signed in spends a guaranteed refusal on every visit to this screen.
  const application = usePartnerApplication({ enabled: isAuthenticated });
  const flow = usePhoneAuthFlow(getApiClient());
  const flowWithAudio = {
    ...flow,
    phoneError: readableFieldError(flow.phoneError),
    codeError: readableFieldError(flow.codeError),
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

  if (!hydrated || guard.status === "checking") {
    return (
      <LoginShell>
        <LoginWait message="Checking your session…" />
      </LoginShell>
    );
  }

  if (guard.status === "error") {
    return (
      <LoginShell>
        <main className="mx-auto w-full max-w-md px-4 py-32">
          <ErrorState
            title="We could not check your session"
            message="Nothing has changed. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => window.location.reload()}
          />
        </main>
      </LoginShell>
    );
  }

  if (isAuthenticated) {
    return (
      <LoginShell>
        <LoginWait message="Taking you to your account…" />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      {/* Floating Dynamic-Island Navigation Matching All Screens */}
      <div className="fixed top-3 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <header className="pointer-events-auto mx-auto max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-full bg-white/95 backdrop-blur-2xl border border-line-strong shadow-[0_12px_32px_rgba(0,17,46,0.12),0_1px_3px_rgba(0,0,0,0.05)] px-3.5 sm:px-5 py-2.5 transition-all duration-300">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <HomeHeroLink className="flex min-h-11 items-center gap-2 group">
                <Logo className="h-6 sm:h-7 w-auto" />
              </HomeHeroLink>

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
            <nav className="hidden lg:flex items-center gap-1 rounded-full bg-surface-sunken/80 border border-line p-1">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  className="whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold text-text-secondary transition-colors duration-150 hover:bg-surface hover:text-navy-900"
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
        {/* `padding="none"`, not `p-0`: Card's own `p-6` wins over a className
            (see card.tsx), which framed the dark header in a white border. */}
        <Card
          padding="none"
          className="overflow-hidden shadow-xl border border-line-strong rounded-3xl bg-surface"
        >
          {/* Header Card Accent */}
          <div className="bg-[#00112e] px-6 py-7 text-white relative overflow-hidden">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 bg-signal-500/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10 mb-3">
                Partner Sign In
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Welcome back
              </h1>
              {/* Follows the step: on the code step this still asked for the
                  number the person had already entered. */}
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                {flow.phase === "code"
                  ? "Almost there. Enter the code we sent to your phone to sign in."
                  : "Sign in with the mobile number you registered with to see your account and job offers."}
              </p>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-6 sm:p-7">
            <OtpForm
              {...flowWithAudio}
              heading={flow.phase === "code" ? "Enter your code" : "Your mobile number"}
              headingLevel={2}
              phoneDigits={10}
              // No form-level `description`. `OtpForm` already prints "We will
              // send a 6-digit code by SMS." against the field itself, and the
              // hero above already explains what the number is for — so this
              // slot was a third telling of the same sentence, stacked directly
              // on top of the second. On a 375px screen that pushed the input
              // itself down for no added meaning.
              verifyLabel="Verify & Sign In"
              footer={
                <div className="mt-1 flex flex-col gap-1 rounded-2xl border border-line bg-surface-sunken p-4">
                  <p className="text-sm font-bold text-navy-900">New to V Solve Hub?</p>
                  <p className="text-xs leading-relaxed text-text-muted">
                    Takes only 5 minutes. Free to join with weekly payouts.
                  </p>
                  <Link
                    href="/apply"
                    className="mt-1 inline-flex min-h-11 items-center self-start text-sm font-bold text-signal-700 underline underline-offset-4 hover:text-signal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Register as a new Partner
                  </Link>
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
    </LoginShell>
  );
}
