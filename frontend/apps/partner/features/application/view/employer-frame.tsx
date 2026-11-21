"use client";

import { useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, ErrorState, buttonStyles, useT } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

import { previousStep } from "../model/progress";
import { nextStep } from "../model/steps";
import { isVersionConflict } from "../queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";

type Application = Schemas["PartnerApplication"];

/**
 * The name given at sign-up, offered as the starting value so nobody types it twice. Never
 * overwrites what the applicant has already typed or saved.
 */
export function useSignUpName(): string {
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });
  return (profile.data?.full_name ?? "").trim();
}

/** Where Back and Continue lead from the screen being shown, for this employer. */
export function useEmployerNav(application: Application) {
  const router = useRouter();
  const pathname = usePathname();
  const hiringAs = application.employer?.hiring_as;
  const back = previousStep(pathname, application.track, hiringAs);
  const next = nextStep(pathname, application.track, hiringAs);
  return {
    back,
    next,
    goNext: () => router.push(next?.href ?? "/apply"),
  };
}

/**
 * What every employer screen sits in: the title, the form, the error from the last save, and the
 * Back and Continue buttons.
 *
 * Continue stays disabled until the screen says it can go on. On an application that can no longer
 * be edited the fields are locked and Continue only moves on, so a sent application can still be
 * read screen by screen.
 */
export function EmployerFrame({
  application,
  title,
  description,
  canContinue,
  saving,
  error,
  onContinue,
  children,
}: {
  application: Application;
  title: string;
  description?: string;
  canContinue: boolean;
  saving: boolean;
  error: unknown;
  onContinue: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const { back, goNext } = useEmployerNav(application);
  const editable = application.can_edit;

  return (
    <>
      <StepFrame title={title} description={description}>
        {editable ? null : (
          <p
            role="status"
            className="rounded-card border border-info-line bg-info-surface p-4 text-sm text-info-text"
          >
            {t("apply.editor.readOnlyNotice")}
          </p>
        )}
        <fieldset disabled={!editable || saving} className="flex min-w-0 flex-col gap-5 border-0 p-0">
          {children}
        </fieldset>
      </StepFrame>

      <ApplyDock>
        {error ? (
          isVersionConflict(error) ? (
            <ErrorState
              inline
              severity="warning"
              title={t("apply.editor.conflict.title")}
              message={t("apply.editor.conflict.message")}
            />
          ) : (
            <ErrorState
              inline
              title={t("apply.editor.saveFailed.title")}
              message={friendlyErrorMessage(error)}
            />
          )
        ) : null}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href={back?.href ?? "/apply"}
            className={buttonStyles({
              variant: "outline",
              size: "lg",
              className: "shrink-0 px-4 sm:px-5 font-bold text-sm sm:text-base",
            })}
          >
            {t("common.back")}
          </Link>
          <Button
            size="lg"
            block
            loading={saving}
            loadingLabel={t("common.saving")}
            disabled={editable && !canContinue}
            className="flex-1 font-bold text-sm sm:text-base"
            onClick={editable ? onContinue : goNext}
          >
            {t("apply.editor.continue")}
          </Button>
        </div>
      </ApplyDock>
    </>
  );
}
