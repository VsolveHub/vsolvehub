"use client";

import { useAuthGuard, useLogout, useOtpFlow } from "@vsolve/query";
import { Button, ErrorState, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The signed-in shell for `/apply/*`.
 *
 * One gate for the whole onboarding tree rather than a check per page: an
 * applicant who is halfway through and gets logged out — Operations revokes a
 * session, the cookie expires — must not discover it one page at a time.
 *
 * No role is required. `PATCH /api/v1/partner/application/` is `IsAuthenticated`
 * and nothing more, which is correct: someone applying to be a Partner does not
 * have the Partner role yet, and demanding it here would lock out every new
 * applicant.
 */

const STEPS = [
  { href: "/apply", label: "Overview" },
  { href: "/apply/about", label: "About you" },
  { href: "/apply/work", label: "Your work" },
  { href: "/apply/areas", label: "Where you work" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/schedule", label: "Your hours" },
  { href: "/apply/review", label: "Review and send" },
] as const;

function ApplyLogin() {
  const flow = useOtpFlow(getApiClient());

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-text">Become a Partner</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Log in with your mobile number to start or continue your application. We
        will text you a code — there is no password.
      </p>

      <div className="mt-6">
        <OtpForm
          {...flow}
          heading="Your mobile number"
          headingLevel={2}
          description="Use the number you want customers and support to reach you on."
          verifyLabel="Verify and continue"
          footer={
            <p>
              Applying does not commit you to anything. You choose the hours you
              work, and you can stop at any time.
            </p>
          }
        />
      </div>
    </div>
  );
}

export function ApplyShell({ children }: { children: ReactNode }) {
  const guard = useAuthGuard(getApiClient());
  const logout = useLogout(getApiClient());

  if (guard.status === "checking") {
    return (
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your application…
      </div>
    );
  }

  // Covers both "never logged in" (a 200 projection with `user: null`) and
  // "session ended" (a 401). The copy stays neutral because the login screen is
  // the same either way; screens that need to word the difference read
  // `guard.reason`.
  if (guard.status === "unauthenticated") return <ApplyLogin />;

  if (guard.status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title="We could not open your application"
          message="Nothing has been lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/apply" className="text-lg font-bold text-text">
          Your application
        </Link>
        <div className="flex items-center gap-3">
          <span data-numeric className="text-sm text-text-secondary">
            {guard.user.phone_number}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            loading={logout.isPending}
            loadingLabel="Logging out"
          >
            Log out
          </Button>
        </div>
      </header>

      {/* Horizontal on a phone, so the whole path stays visible without the
          steps shrinking to unreadable. */}
      <nav aria-label="Application steps" className="-mx-4 mt-4 overflow-x-auto px-4">
        <ul className="flex list-none gap-1 p-0">
          {STEPS.map((step) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                {step.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mt-6">{children}</main>
    </div>
  );
}
