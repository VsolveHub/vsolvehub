"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, usePhoneAuthFlow } from "@vsolve/query";
import { Card, ErrorState, Logo, OtpForm, Spinner, useHydrated, useT } from "@vsolve/ui";
import { CheckCircle2, HelpCircle, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
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
function navItems(t: ReturnType<typeof useT>) {
  return [
    { href: "/how-it-works", label: t("auth.login.nav.howItWorks") },
    { href: "/benefits", label: t("auth.login.nav.earningsAndBenefits") },
    { href: "/trades", label: t("auth.login.nav.tradesAndServices") },
    { href: "/contact", label: t("auth.login.nav.support") },
  ];
}

/**
 * Field errors as sentences.
 *
 * The flow passes Django's field message through unchanged, and for a wrong
 * code that message is currently the bare error code — the screen printed
 * `invalid_otp` under the field. Anything shaped like a machine code is
 * translated here; a real sentence from Django is left as it is.
 */
function readableFieldError(t: ReturnType<typeof useT>, message: string | null | undefined): string | null {
  if (!message) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(message)) return message;
  const FIELD_ERROR_COPY: Record<string, string> = {
    invalid_otp: t("auth.login.error.invalidOtp"),
    invalid_phone_number: t("auth.login.error.invalidPhoneNumber"),
  };
  return FIELD_ERROR_COPY[message] ?? t("auth.login.error.generic");
}

function LoginShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-canvas text-text relative overflow-x-clip">{children}</div>;
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
  const t = useT();
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
    phoneError: readableFieldError(t, flow.phoneError),
    codeError: readableFieldError(t, flow.codeError),
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
  const hasRejectedDocs = (application.data?.documents ?? []).some((d) => d.status === "REJECTED");

  useEffect(() => {
    if (!isAuthenticated) return;

    if (next) {
      router.replace(next);
      return;
    }

    if (!knowsWhereToGo) return;
    router.replace(homeForApplication(application.data?.status ?? null, hasRejectedDocs));
  }, [application.data?.status, hasRejectedDocs, isAuthenticated, knowsWhereToGo, next, router]);

  if (!hydrated || guard.status === "checking") {
    return (
      <LoginShell>
        <LoginWait message={t("common.checkingSession")} />
      </LoginShell>
    );
  }

  if (guard.status === "error") {
    return (
      <LoginShell>
        <main className="mx-auto w-full max-w-md px-4 py-32">
          <ErrorState
            title={t("common.couldNotCheckSession")}
            message={t("common.nothingChanged")}
            actionLabel={t("common.tryAgain")}
            onAction={() => window.location.reload()}
          />
        </main>
      </LoginShell>
    );
  }

  if (isAuthenticated) {
    return (
      <LoginShell>
        <LoginWait message={t("common.takingYouToYourAccount")} />
      </LoginShell>
    );
  }

  const nav = navItems(t);

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
                <span className="text-text-secondary font-medium">{t("auth.login.nowOnboarding")}</span>
                <span className="text-navy-900 font-bold">{t("auth.login.city")}</span>
              </div>
            </div>

            {/* Desktop Center Navigation Capsule */}
            <nav className="hidden lg:flex items-center gap-1 rounded-full bg-surface-sunken/80 border border-line p-1">
              {nav.map((n) => (
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
              <MarketingMobileNav items={nav} />
            </div>
          </div>
        </header>
      </div>

      {/* Page Content */}
      <main className="mx-auto w-full max-w-md lg:max-w-5xl xl:max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 lg:pt-36 pb-16">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          {/* Desktop Left Column: Registration Portal Value Prop */}
          <div className="hidden lg:flex lg:col-span-7 flex-col gap-6 pr-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-sunken px-3.5 py-1 text-xs font-bold text-navy-900 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Partner Onboarding Portal
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                <Sparkles size={12} className="text-amber-600" />
                Desktop Registration
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="text-4xl xl:text-5xl font-black tracking-tight text-navy-900 leading-[1.15]">
                Register & Verify as a Partner on Desktop
              </h1>
              <p className="text-base text-text-secondary leading-relaxed max-w-lg">
                Enter your mobile number to register as a new partner or continue your document verification. Once approved, live dispatches operate exclusively on our Partner Mobile App.
              </p>
            </div>

            {/* 3 Pillars */}
            <div className="grid gap-3.5 sm:grid-cols-2 pt-2">
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-navy-900">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span>KYC & Document Review</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Fast 24-hour verification for Government ID, Address Proof & bank accounts.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-navy-900">
                  <Smartphone size={16} className="text-blue-600" />
                  <span>Mobile App Operations</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Daily job requests, turn-by-turn navigation, and customer chat run on phone.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2 text-xs font-semibold text-text-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" /> 15,000+ Verified Partners
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" /> Direct Bank Deposits
              </span>
            </div>
          </div>

          {/* Right Column: OtpForm Card */}
          <div className="w-full lg:col-span-5 mx-auto max-w-md">
            <Card
              padding="none"
              className="overflow-hidden shadow-xl border border-line-strong rounded-3xl bg-surface"
            >
              {/* Header Card Accent */}
              <div className="bg-[#00112e] px-6 py-7 text-white relative overflow-hidden">
                <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 bg-signal-500/10 rounded-full blur-2xl" />
                <div className="relative z-10">
                  <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10 mb-3">
                    {t("auth.login.badge")}
                  </span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-white">
                    {t("auth.login.welcomeBack")}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                    {flow.phase === "code"
                      ? t("auth.login.hero.code")
                      : t("auth.login.hero.phone")}
                  </p>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-6 sm:p-7">
                <OtpForm
                  {...flowWithAudio}
                  heading={flow.phase === "code" ? t("auth.login.heading.code") : t("auth.login.heading.phone")}
                  headingLevel={2}
                  phoneDigits={10}
                  verifyLabel={t("auth.login.verifyLabel")}
                  footer={
                    <div className="mt-1 flex flex-col gap-1 rounded-2xl border border-line bg-surface-sunken p-4">
                      <p className="text-sm font-bold text-navy-900">{t("auth.login.newToVsh")}</p>
                      <p className="text-xs leading-relaxed text-text-muted">{t("auth.login.newToVshDetail")}</p>
                      <Link
                        href="/apply"
                        className="mt-1 inline-flex min-h-11 items-center self-start text-sm font-bold text-signal-700 underline underline-offset-4 hover:text-signal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        {t("auth.login.registerAsNewPartner")}
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
                {t("auth.login.needHelp")}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </LoginShell>
  );
}
