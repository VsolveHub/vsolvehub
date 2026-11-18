"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { useCurrentSession } from "@vsolve/query";
import { Badge, ErrorState, Skeleton, buttonStyles, useT } from "@vsolve/ui";
import { CheckCircle2, MapPin, Pencil, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { OfferableService } from "@/features/catalog/queries";
import { getApiClient } from "@/lib/api/browser";

import { isEditable, requiredDocumentKinds } from "../model/readiness";
import { WEEKDAY_KEYS } from "../model/schedule";
import {
  applicationStatusPresentation,
  currentDocument,
  documentLabelKey,
  documentStatusPresentation,
  trackLabelKey,
} from "../model/status";
import { applicationSteps, isListingTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference, type ApplicationReference } from "../reference-queries";

type Application = Schemas["PartnerApplication"];
type T = ReturnType<typeof useT>;

interface SectionProps {
  application: Application;
  reference: ApplicationReference;
  services: readonly OfferableService[];
  t: T;
}

/**
 * Read-only preview of everything the applicant has entered, one card per step of their own track
 * (6 for services, 3 for stays, rentals and hiring). Opened from Profile in the account menu, the
 * same page as the phone app's `/apply/profile`.
 *
 * Every value comes from queries the steps already use, so they are usually cached; the job-type
 * names come from the catalogue the page loads on the server, as `/apply/work` does.
 * A new step only needs an entry in `SECTIONS`.
 */
const SECTIONS: Record<string, (props: SectionProps) => ReactNode> = {
  "/apply/about": AboutSection,
  "/apply/work": WorkSection,
  "/apply/areas": AreasSection,
  "/apply/schedule": HoursSection,
  "/apply/documents": DocumentsSection,
  "/apply/review": AgreementsSection,
};

const SUBMITTED_AT = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const ACCEPTED_ON = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

const card = "flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5";
const label = "text-xs font-semibold text-text-muted";
const value = "text-sm leading-relaxed text-text";
const muted = "text-sm text-text-muted";
const chip = "inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary";

export function ProfilePreview({ services }: { services: readonly OfferableService[] }) {
  const t = useT();
  const query = usePartnerApplication();
  const reference = useApplicationReference();
  const session = useCurrentSession(getApiClient());
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label={t("apply.review.loading")}>
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  if ((query.isError && !missing) || reference.isError) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
        onAction={() => {
          void query.refetch();
          reference.refetch();
        }}
      />
    );
  }

  const application = missing ? null : query.data;
  if (!application) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className={muted}>{t("apply.review.notStarted.body")}</p>
        <Link href="/apply" className={buttonStyles({ variant: "primary" })}>
          {t("apply.review.notStarted.cta")}
        </Link>
      </div>
    );
  }

  const editable = isEditable(application);
  const status = applicationStatusPresentation(application.status);
  const name = application.display_name.trim();
  const phone = session.data?.user?.phone_number;
  const steps = applicationSteps(application.track).filter((step) => SECTIONS[step.href]);

  return (
    <div className="flex flex-col gap-3">
      {/* Who, which track, and where the application is now */}
      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-navy-900 text-lg font-extrabold text-white">
            {name ? name[0]?.toUpperCase() : <User size={22} aria-hidden />}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-text">
              {name || t("apply.profile.title")}
            </h1>
            <p className={muted}>{[phone, t(trackLabelKey(application.track))].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="h-px bg-line" />
        <div className="flex items-center justify-between gap-3">
          <span className={label}>{t("apply.account.status")}</span>
          <Badge tone={status.tone} dot>
            {t(status.labelKey)}
          </Badge>
        </div>
        {application.submitted_at ? (
          <p className="text-xs text-text-muted">
            {t("apply.statusBanner.submittedOn", { date: SUBMITTED_AT.format(new Date(application.submitted_at)) })}
          </p>
        ) : null}
      </section>

      {steps.map((step, index) => {
        const Section = SECTIONS[step.href]!;
        return (
          <section key={step.href} className={card}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-bold text-text-secondary">
                {index + 1}
              </span>
              <h2 className="flex-1 text-base font-extrabold text-text">{t(step.labelKey)}</h2>
              {editable ? (
                <Link
                  href={step.href}
                  aria-label={`${t("apply.review.edit")}: ${t(step.labelKey)}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-signal-50 px-3 text-sm font-bold text-signal-700 hover:bg-signal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <Pencil size={13} aria-hidden />
                  {t("apply.review.edit")}
                </Link>
              ) : null}
            </div>
            <div className="flex flex-col gap-3.5 sm:pl-8.5">
              <Section application={application} reference={reference} services={services} t={t} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label}>{name}</span>
      {children}
    </div>
  );
}

function AboutSection({ application, t }: SectionProps) {
  const notSet = t("apply.review.notSet");
  const bioLabel = isListingTrack(application.track) ? "apply.about.bioListing.label" : "apply.about.bio.label";
  return (
    <>
      <Row name={t("apply.about.fullName.label")}>
        <p className={value}>{application.display_name || notSet}</p>
      </Row>
      <Row name={t(bioLabel)}>
        <p className={`${value} whitespace-pre-line`}>{application.biography || notSet}</p>
      </Row>
    </>
  );
}

function WorkSection({ application, reference, services, t }: SectionProps) {
  const notSet = t("apply.review.notSet");
  const trades = application.skill_codes.map(
    (code) => reference.skills.find((skill) => skill.code === code)?.name ?? code,
  );
  const jobTypes = application.service_variant_ids
    .map((id) => services.find((service) => service.variantId === id))
    .filter((service) => service !== undefined)
    .map((service) => `${service.serviceName} · ${service.variantName}`);

  return (
    <>
      <Row name={t("apply.profile.trades")}>
        <p className={value}>{trades.length > 0 ? trades.join(", ") : notSet}</p>
      </Row>
      <Row name={t("apply.work.jobTypes")}>
        {jobTypes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {jobTypes.map((jobType) => (
              <li key={jobType} className={chip}>
                {jobType}
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>{notSet}</p>
        )}
      </Row>
    </>
  );
}

function areaName(reference: ApplicationReference, id: string): string | undefined {
  return reference.serviceAreas.find((area) => area.id === id)?.name;
}

function AreasSection({ application, reference, t }: SectionProps) {
  const names = application.service_area_ids.map((id) => areaName(reference, id)).filter(Boolean);
  if (names.length === 0) return <p className={muted}>{t("apply.review.notSet")}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li key={name} className={chip}>
          <MapPin size={12} aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}

function HoursSection({ application, reference, t }: SectionProps) {
  const availability = usePartnerAvailability();
  if (availability.isPending) return <Skeleton className="h-16 w-full" />;
  if (availability.isError) return <p className={muted}>{t("apply.schedule.loadError.title")}</p>;

  const rules = availability.data.rules.filter((rule) => rule.is_active);
  if (application.service_area_ids.length === 0 || rules.length === 0) {
    return <p className={muted}>{t("apply.review.notSet")}</p>;
  }

  return (
    <>
      {application.service_area_ids.map((areaId) => {
        const areaRules = rules
          .filter((rule) => rule.service_area_id === areaId)
          .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
        return (
          <Row key={areaId} name={areaName(reference, areaId) ?? t("apply.steps.areas")}>
            {areaRules.length === 0 ? (
              <p className={muted}>{t("apply.review.notSet")}</p>
            ) : (
              <dl className="flex flex-col gap-1">
                {areaRules.map((rule) => {
                  const weekdayKey = WEEKDAY_KEYS[rule.weekday];
                  return (
                  <div key={rule.id} className="flex justify-between gap-3 text-sm text-text">
                    <dt>{weekdayKey ? t(weekdayKey) : ""}</dt>
                    <dd className="tabular-nums">
                      {`${rule.starts_at.slice(0, 5)} – ${rule.ends_at.slice(0, 5)}`}
                      {rule.ends_next_day ? ` ${t("apply.profile.nextDay")}` : ""}
                    </dd>
                  </div>
                  );
                })}
              </dl>
            )}
          </Row>
        );
      })}
    </>
  );
}

function DocumentsSection({ application, t }: SectionProps) {
  return (
    <>
      {requiredDocumentKinds(application).map((kind) => {
        const doc = currentDocument(application, kind);
        const status = doc ? documentStatusPresentation(doc) : null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-text">{t(documentLabelKey(kind))}</span>
              <Badge tone={status?.tone ?? "neutral"} dot>
                {t(status?.labelKey ?? "apply.documents.notUploaded")}
              </Badge>
            </div>
            {doc ? <p className="truncate text-xs text-text-muted">{doc.file_name}</p> : null}
            {doc?.review_reason ? <p className="text-sm text-danger-text">{doc.review_reason}</p> : null}
          </div>
        );
      })}
    </>
  );
}

function AgreementsSection({ application, reference, t }: SectionProps) {
  const accepted = application.consents.filter((consent) => consent.withdrawn_at === null);
  if (accepted.length === 0) return <p className={muted}>{t("apply.profile.notAccepted")}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {accepted.map((consent) => (
        <li key={consent.id} className="flex gap-2.5">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-text" aria-hidden />
          <div>
            <p className={value}>
              {reference.requiredConsents.find((doc) => doc.purpose === consent.purpose)?.title ?? consent.purpose}
            </p>
            <p className="text-xs text-text-muted">
              {t("apply.profile.acceptedOn", { date: ACCEPTED_ON.format(new Date(consent.accepted_at)) })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
