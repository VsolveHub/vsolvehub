"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Skeleton, buttonStyles, useT } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PushOptInCard } from "@/features/notifications/view/partner-push-preferences";

import { previousStep } from "../model/progress";
import { isEditable, outstandingRequirements, requiredDocumentKinds } from "../model/readiness";
import { currentDocument, documentLabelKey, documentStatusPresentation } from "../model/status";
import { isListingTrack } from "../model/steps";
import {
  isVersionConflict,
  usePartnerApplication,
  usePartnerAvailability,
  useSubmitApplication,
  useUpdateApplication,
} from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";
import { ConsentList, consentKey } from "./consent-step";
import { ApplicationStatusTracker } from "./status-banner";

type Application = Schemas["PartnerApplication"];
type ConsentDocument = Schemas["PartnerConsentDocument"];

/**
 * The last step: check it, accept the agreements, send it.
 *
 * The agreements live here rather than on a step of their own — accepting the terms and sending
 * the application are one decision. Sending saves any newly ticked agreement first, then submits,
 * so the Partner taps once.
 */
export function ReviewStep() {
  const t = useT();
  const query = usePartnerApplication();
  const availability = usePartnerAvailability();
  const reference = useApplicationReference();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending || availability.isPending) {
    return (
      <div role="status" aria-label={t("apply.review.loading")} className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  if ((query.isError && !isMissing) || reference.isError) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => {
          void query.refetch();
          reference.refetch();
        }}
      />
    );
  }

  const application = query.data ?? null;
  if (application === null) {
    return (
      <StepFrame title={t("apply.steps.review")}>
        <p className="text-sm text-text-secondary">{t("apply.review.notStarted.body")}</p>
        <Link href="/apply" className={buttonStyles({ className: "self-start" })}>
          {t("apply.review.notStarted.cta")}
        </Link>
      </StepFrame>
    );
  }

  return (
    <ReviewForm
      application={application}
      availability={availability.data ?? null}
      requiredConsents={reference.requiredConsents}
      areaNames={new Map(reference.serviceAreas.map((area) => [area.id, area.name]))}
    />
  );
}

function ReviewForm({
  application,
  availability,
  requiredConsents,
  areaNames,
}: {
  application: Application;
  availability: Schemas["PartnerSchedule"] | null;
  requiredConsents: readonly ConsentDocument[];
  areaNames: ReadonlyMap<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const update = useUpdateApplication();
  const submit = useSubmitApplication();

  const editable = isEditable(application);
  const listing = isListingTrack(application.track);
  const locked = new Set(
    application.consents
      .filter((consent) => consent.withdrawn_at === null)
      .map((consent) => consentKey(consent.purpose, consent.document_version)),
  );
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => new Set(locked));
  const [declared, setDeclared] = useState(false);

  const outstanding = outstandingRequirements(application, availability).filter(
    (requirement) => requirement.code !== "CONSENTS",
  );
  const consentsTicked = requiredConsents.every((document) =>
    accepted.has(consentKey(document.purpose, document.document_version)),
  );
  const ready = editable && outstanding.length === 0 && consentsTicked && declared;
  const isSending = update.isPending || submit.isPending;
  const failure = update.error ?? submit.error;
  const back = previousStep(pathname, application.track);

  function toggle(document: ConsentDocument) {
    const key = consentKey(document.purpose, document.document_version);
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function send() {
    const added = requiredConsents.filter((document) => {
      const key = consentKey(document.purpose, document.document_version);
      return accepted.has(key) && !locked.has(key);
    });
    try {
      if (added.length > 0) {
        await update.mutateAsync({
          consents: added.map((document) => ({
            purpose: document.purpose,
            document_version: document.document_version,
          })),
        });
      }
      await submit.mutateAsync();
      router.push("/apply");
    } catch {
      // Shown from the mutation state below.
    }
  }

  const hoursSet = application.service_area_ids.filter((areaId) =>
    (availability?.rules ?? []).some((rule) => rule.service_area_id === areaId && rule.is_active),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {application.status === "DRAFT" ? null : <ApplicationStatusTracker application={application} />}

      <StepFrame title={t("apply.steps.review")} description={editable ? t("apply.review.description") : undefined}>
        <dl className="flex flex-col divide-y divide-line">
          <SummaryRow label={t("apply.steps.about")} href={editable ? "/apply/about" : null}>
            {application.display_name || t("apply.review.notSet")}
          </SummaryRow>
          {listing ? null : (
            <SummaryRow label={t("apply.steps.work")} href={editable ? "/apply/work" : null}>
              {t("apply.review.summary.work", {
                trades: application.skill_codes.length,
                jobs: application.service_variant_ids.length,
              })}
            </SummaryRow>
          )}
          {listing ? null : (
            <SummaryRow label={t("apply.steps.areas")} href={editable ? "/apply/areas" : null}>
              {application.service_area_ids.length > 0
                ? application.service_area_ids.map((id) => areaNames.get(id) ?? id.slice(0, 8)).join(", ")
                : t("apply.review.notSet")}
            </SummaryRow>
          )}
          {listing ? null : (
            <SummaryRow label={t("apply.steps.schedule")} href={editable ? "/apply/schedule" : null}>
              {t("apply.review.summary.hours", { set: hoursSet, total: application.service_area_ids.length })}
            </SummaryRow>
          )}
          <SummaryRow label={t("apply.steps.documents")} href={editable ? "/apply/documents" : null}>
            <span className="flex flex-wrap gap-1.5">
              {requiredDocumentKinds(application).map((kind) => {
                const document = currentDocument(application, kind);
                const badge = document ? documentStatusPresentation(document) : null;
                return (
                  <Badge key={kind} tone={badge?.tone ?? "neutral"}>
                    {t(documentLabelKey(kind))}: {badge ? t(badge.labelKey) : t("apply.documents.notUploaded")}
                  </Badge>
                );
              })}
            </span>
          </SummaryRow>
        </dl>

        {editable && outstanding.length > 0 ? (
          <div className="rounded-control border border-warning-line bg-warning-surface p-3">
            <p className="text-sm font-bold text-text">{t("apply.review.outstandingNotice")}</p>
            <ul className="mt-1 flex list-none flex-col p-0">
              {outstanding.map((requirement) => (
                <li key={requirement.code}>
                  <Link
                    href={requirement.href}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-text underline underline-offset-2"
                  >
                    {t(requirement.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {editable ? (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-text">{t("apply.requirements.consents")}</h2>
              <ConsentList
                documents={requiredConsents}
                accepted={accepted}
                locked={locked}
                disabled={isSending}
                onToggle={toggle}
              />
            </section>

            <label className="flex items-start gap-3 rounded-control border border-line p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={declared}
                disabled={isSending}
                onChange={(event) => setDeclared(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-action"
              />
              <span className="text-sm text-text break-words">{t("apply.review.declaration")}</span>
            </label>

            <PushOptInCard />
          </>
        ) : null}
      </StepFrame>

      {editable ? (
        <ApplyDock>
          {isVersionConflict(failure) ? (
            <ErrorState
              inline
              severity="warning"
              title={t("apply.review.conflict.title")}
              message={t("apply.review.conflict.message")}
            />
          ) : failure ? (
            <ErrorState
              inline
              title={t("apply.review.submitError.title")}
              message={
                failure instanceof ApiRequestError && failure.message
                  ? failure.message
                  : t("apply.review.submitError.message")
              }
              reference={failure instanceof ApiRequestError ? failure.requestId : null}
            />
          ) : null}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href={back?.href ?? "/apply"}
              className={buttonStyles({ variant: "outline", size: "lg", className: "shrink-0 px-4 sm:px-5 font-bold text-sm sm:text-base" })}
            >
              {t("common.back")}
            </Link>
            <Button
              size="lg"
              block
              className="flex-1 font-bold text-sm sm:text-base"
              disabled={!ready}
              loading={isSending}
              loadingLabel={t("apply.review.submitting")}
              onClick={() => void send()}
            >
              {application.status === "CHANGES_REQUIRED" ? t("apply.review.resubmit") : t("apply.review.submit")}
            </Button>
          </div>
        </ApplyDock>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  href,
  children,
}: {
  label: string;
  href: string | null;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold text-text-secondary">{label}</dt>
        <dd className="mt-0.5 text-sm text-text break-words">{children}</dd>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-action underline underline-offset-2"
        >
          {t("apply.review.edit")}
        </Link>
      ) : null}
    </div>
  );
}
