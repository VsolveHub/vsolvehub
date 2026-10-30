"use client";

import { useAuthGuard } from "@vsolve/query";
import { Button, Card, ErrorState, Spinner, useT } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";
import { usePartnerApplication } from "../queries";

/**
 * The session gate for onboarding, without the signed-in app's chrome.
 *
 * ## Why `/apply` does not use `PartnerShell`
 *
 * `PartnerShell` renders the four-destination tab bar — Home, Work, Money, Me —
 * on every route it wraps, `/apply` included. All four point at screens an
 * applicant cannot use: they have no work, no earnings and no duty control, and
 * three of the four refuse them at the API. So somebody halfway through
 * onboarding was given a persistent navigation bar whose every destination was
 * a dead end, plus a Sign Out button in the header, and *no* indication of how
 * far through the application they were.
 *
 * Onboarding is a linear flow, not a tabbed app. It needs the opposite chrome:
 * where you are in the sequence, a way back one step, and a way out. That is
 * what `ApplyShell` draws, and it can only draw it if nothing else owns the top
 * and bottom of the screen.
 *
 * ## This is not a second copy of the session decision
 *
 * `PartnerShell`'s own docblock warns — correctly — that onboarding, offers and
 * availability each having their own login form is how one expired cookie
 * produced three different lock-out messages. That warning is about three
 * copies of the *decision*, and this is not one: it calls the same
 * `useAuthGuard` hook against the same client and sends an unauthenticated
 * visitor to the same `/login?next=` that `PartnerShell` does. What differs is
 * only what gets drawn around the children.
 *
 * ## No role requirement, deliberately
 *
 * Django grants the `partner` role when an application is *created*, and
 * `PATCH /api/v1/partner/application/` is `IsAuthenticated` and nothing more.
 * Requiring the role here would refuse every person who has not applied yet —
 * precisely the people this tree exists for. Same call `PartnerShell` makes for
 * this route, for the same reason.
 */
export function ApplyGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const guard = useAuthGuard(getApiClient());
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";

  // An approved partner must never see the onboarding / application screens again.
  const application = usePartnerApplication({
    enabled: guard.status === "authenticated",
  });
  const isApproved = application.data?.status === "APPROVED";

  useEffect(() => {
    if (isApproved) {
      router.replace("/me/documents");
    }
  }, [isApproved, router]);

  useEffect(() => {
    if (!isUnauthenticated) return;
    const query = searchParams.toString();
    const fullUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?next=${encodeURIComponent(fullUrl)}`);
  }, [isUnauthenticated, pathname, router, searchParams]);

  // Check phone mismatch between active session and URL parameter
  const phoneParam = searchParams.get("phone");
  const activePhoneDigits = guard.user?.phone_number
    ? guard.user.phone_number.replace(/\D/g, "").slice(-10)
    : null;
  const requestedPhoneDigits = phoneParam ? phoneParam.replace(/\D/g, "").slice(-10) : null;

  const isPhoneMismatch = Boolean(
    guard.status === "authenticated" &&
    requestedPhoneDigits &&
    activePhoneDigits &&
    requestedPhoneDigits !== activePhoneDigits
  );

  if (guard.status === "checking") return <Waiting>{t("common.checkingAccess")}</Waiting>;
  if (isUnauthenticated) return <Waiting>{t("common.takingYouToSignIn")}</Waiting>;
  if (guard.isSelectingRole) return <Waiting>{t("common.openingYourAccount")}</Waiting>;
  if (isApproved) return <Waiting>{t("apply.guard.openingWorkspace")}</Waiting>;

  if (isPhoneMismatch) {
    const handleContinueAsCurrent = () => {
      // Remove ?phone from URL so user continues with their current session cleanly
      router.replace(pathname);
    };

    const handleSwitchAccount = () => {
      // Direct to login with switch=true and the requested phone prefilled
      router.push(`/login?phone=${encodeURIComponent(requestedPhoneDigits!)}&next=${encodeURIComponent(pathname)}&switch=true`);
    };

    return (
      <Centred>
        <Card className="p-6 sm:p-7 border border-line-strong rounded-3xl shadow-xl bg-surface">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-lg shrink-0">
                ⚠️
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-navy-900">{t("apply.guard.switchAccount.title")}</h2>
                <p className="text-xs text-text-secondary">{t("apply.guard.switchAccount.subtitle")}</p>
              </div>
            </div>

            <p className="text-sm text-text leading-relaxed">
              {t("apply.guard.switchAccount.body", {
                current: guard.user?.phone_number || activePhoneDigits || "",
                requested: `+91 ${requestedPhoneDigits}`,
              })}
            </p>

            <div className="rounded-2xl bg-surface-sunken p-3.5 border border-line text-xs text-text-muted">
              {t("apply.guard.switchAccount.chooseHint", { requested: `+91 ${requestedPhoneDigits}` })}
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                variant="primary"
                onClick={handleSwitchAccount}
                className="w-full justify-center font-bold"
              >
                {t("apply.guard.switchAccount.switchTo", { phone: `+91 ${requestedPhoneDigits}` })}
              </Button>
              <Button
                variant="secondary"
                onClick={handleContinueAsCurrent}
                className="w-full justify-center"
              >
                {t("apply.guard.switchAccount.continueAs", { phone: guard.user?.phone_number || activePhoneDigits || "" })}
              </Button>
            </div>
          </div>
        </Card>
      </Centred>
    );
  }

  if (guard.status === "error") {
    return (
      <Centred>
        <ErrorState
          title={t("common.couldNotCheckAccess")}
          message={t("common.nothingChanged")}
          actionLabel={t("common.tryAgain")}
          onAction={() => window.location.reload()}
        />
      </Centred>
    );
  }

  /*
    `forbidden` is unreachable here — nothing is required beyond a session — but
    it is a real member of the union, and falling through to render onboarding
    for it would be the one branch that shows an applicant a form they are not
    allowed to submit. Treated as the refusal it is.
  */
  if (guard.status === "forbidden") {
    return (
      <Centred>
        <ErrorState
          title={t("apply.guard.forbidden.title")}
          message={t("apply.guard.forbidden.message")}
        />
      </Centred>
    );
  }

  return <>{children}</>;
}

function Centred({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5 py-10">
      {children}
    </main>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <Centred>
      <p className="flex items-center justify-center gap-2.5 text-[0.9375rem] text-text-secondary">
        <Spinner size="sm" />
        {children}
      </p>
    </Centred>
  );
}
