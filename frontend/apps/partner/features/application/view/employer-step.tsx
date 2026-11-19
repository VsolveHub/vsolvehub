"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage, queryKeys } from "@vsolve/query";
import { Button, ErrorState, Field, Input, Skeleton, buttonStyles, cn, useT } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  toBusinessProfileInput,
  type BusinessCategory,
  type BusinessProfileInput,
} from "@/features/capability/adapters/wire";
import { usePartnerBusinessProfile, useSaveBusinessProfile } from "@/features/capability/queries";

import { previousStep } from "../model/progress";
import { nextStep } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";

const CATEGORIES: readonly BusinessCategory[] = ["SHOP", "CLINIC", "OFFICE", "RESTAURANT", "OTHER"];
/** 15 characters: 2-digit state code, PAN, entity number, "Z", check character. */
const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;

type Problem = "name" | "category" | "city" | "gstin";

/** What the server will refuse at submit, said before saving. Same rule as the backend. */
function problemsIn(input: BusinessProfileInput): Set<Problem> {
  const problems = new Set<Problem>();
  if (!input.legal_name.trim()) problems.add("name");
  if (!input.business_category) problems.add("category");
  if (!input.city.trim()) problems.add("city");
  if (input.gstin.trim() && !GSTIN.test(input.gstin.trim())) problems.add("gstin");
  return problems;
}

/**
 * "Business details", the employer's own step ("I want to hire staff"): the business name its
 * jobs are shown under, the kind of business and the city, plus an optional address and GSTIN.
 *
 * Saved through the existing business profile (`PUT /partner/business-profile/`) as an
 * `EMPLOYER`; the application's `business_details_complete` then marks the step done.
 */
export function EmployerStep() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const application = usePartnerApplication();
  const profile = usePartnerBusinessProfile();
  const save = useSaveBusinessProfile();
  const [draft, setDraft] = useState<BusinessProfileInput | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const missing = application.error instanceof ApiRequestError && application.error.status === 404;
  const track = application.data?.track ?? null;
  const notEmployer = application.isSuccess && track !== "EMPLOYER";
  // Only employers are asked; anyone else who lands here goes back to the overview.
  useEffect(() => {
    if (notEmployer) router.replace("/apply");
  }, [notEmployer, router]);

  if (application.isPending || profile.isPending) {
    return (
      <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }
  if ((application.isError && !missing) || profile.isError) {
    return (
      <ErrorState
        title={t("apply.employer.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
        onAction={() => {
          void application.refetch();
          void profile.refetch();
        }}
      />
    );
  }

  if (notEmployer || missing) return null;

  const editable = application.data?.can_edit ?? false;
  const current = draft ?? toBusinessProfileInput(profile.data ?? null);
  const update = (patch: Partial<BusinessProfileInput>) => setDraft({ ...current, ...patch });
  const problems = problemsIn(current);
  const errorFor = (problem: Problem, key: string) =>
    showProblems && problems.has(problem) ? t(key) : undefined;
  const back = previousStep(pathname, track);
  const next = nextStep(pathname, track);

  const onContinue = () => {
    if (!editable) {
      router.push(next?.href ?? "/apply");
      return;
    }
    if (problems.size > 0) {
      setShowProblems(true);
      return;
    }
    const gstin = current.gstin.trim().toUpperCase();
    save.mutate(
      {
        ...current,
        business_type: "EMPLOYER",
        legal_name: current.legal_name.trim(),
        city: current.city.trim(),
        address: current.address.trim(),
        gstin,
        // The server takes a GSTIN only with "GST registered" ticked.
        gst_registered: Boolean(gstin),
      },
      {
        onSuccess: async () => {
          // The checklist reads `business_details_complete` from the application.
          await queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
          router.push(next?.href ?? "/apply");
        },
      },
    );
  };

  return (
    <>
      <StepFrame title={t("apply.employer.pageTitle")} description={t("apply.employer.pageDescription")}>
        <fieldset disabled={!editable || save.isPending} className="flex flex-col gap-5">
          <Field label={t("apply.employer.name.label")} required error={errorFor("name", "apply.employer.name.error")}>
            <Input
              value={current.legal_name}
              maxLength={200}
              autoComplete="organization"
              placeholder={t("apply.employer.name.placeholder")}
              onChange={(event) => update({ legal_name: event.target.value })}
            />
          </Field>

          <Field
            label={t("apply.employer.category.label")}
            required
            error={errorFor("category", "apply.employer.category.error")}
          >
            <div role="radiogroup" aria-label={t("apply.employer.category.label")} className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => {
                const selected = current.business_category === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ business_category: category })}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                      selected
                        ? "border-navy-900 bg-navy-900 text-white"
                        : "border-line bg-surface text-text hover:border-line-strong",
                    )}
                  >
                    {t(`apply.employer.category.${category}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("apply.employer.city.label")} required error={errorFor("city", "apply.employer.city.error")}>
            <Input
              value={current.city}
              maxLength={80}
              autoComplete="address-level2"
              onChange={(event) => update({ city: event.target.value })}
            />
          </Field>

          <Field label={t("apply.employer.address.label")}>
            <Input
              value={current.address}
              maxLength={240}
              autoComplete="street-address"
              onChange={(event) => update({ address: event.target.value })}
            />
          </Field>

          <Field label={t("apply.employer.gstin.label")} error={errorFor("gstin", "apply.employer.gstin.error")}>
            <Input
              value={current.gstin}
              maxLength={15}
              autoCapitalize="characters"
              onChange={(event) => update({ gstin: event.target.value.toUpperCase() })}
            />
          </Field>

          {save.error ? (
            <p role="alert" className="text-sm text-danger-text">
              {friendlyErrorMessage(save.error)}
            </p>
          ) : null}
        </fieldset>
      </StepFrame>

      <ApplyDock>
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
            loading={save.isPending}
            className="flex-1 font-bold text-sm sm:text-base"
            onClick={onContinue}
          >
            {t("apply.editor.continue")}
          </Button>
        </div>
      </ApplyDock>
    </>
  );
}
