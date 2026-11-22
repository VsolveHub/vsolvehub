"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { useCurrentSession } from "@vsolve/query";
import { Badge, ErrorState, Skeleton, buttonStyles, cn, useT } from "@vsolve/ui";
import { Check, CheckCircle2, MapPin, Pencil, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { OfferableService } from "@/features/catalog/queries";
import { getApiClient } from "@/lib/api/browser";

import { hiringAsOf } from "../model/employer";
import { SIZES } from "../model/employer-form";
import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { isEditable, requiredDocumentKinds } from "../model/readiness";
import { WEEKDAY_KEYS } from "../model/schedule";
import {
  applicationStatusPresentation,
  currentDocument,
  documentLabelKey,
  documentStatusPresentation,
  trackLabelKey,
} from "../model/status";
import { isListingTrack } from "../model/steps";

import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference, type ApplicationReference } from "../reference-queries";
import { STATUS_ACCENT } from "./status-banner";

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
  "/apply/hiring-as": HiringAsSection,
  "/apply/employer/about": IndividualSection,
  "/apply/employer/business": BusinessSection,
  "/apply/employer/contact": ContactSection,
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
  const availability = usePartnerAvailability();
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
  // The same progress the overview checklist shows, so a card never disagrees with it.
  const progress = stepProgress(application, availability.data).filter((step) => SECTIONS[step.href]);
  const summary = progressSummary(application, availability.data);

  return (
    <div className="flex flex-col gap-3">
      {/* Who, which track, where the application is, and how much of it is done */}
      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
        <div aria-hidden className={cn("h-1", STATUS_ACCENT[status.tone])} />
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-navy-900 text-lg font-extrabold text-white">
              {name ? name[0]?.toUpperCase() : <User size={22} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold tracking-tight text-text">
                {name || t("apply.profile.title")}
              </h1>
              <p className={muted}>{[phone, t(trackLabelKey(application.track))].filter(Boolean).join(" · ")}</p>
            </div>
            <ProgressRing
              done={summary.done}
              total={summary.total}
              label={t("apply.profile.progress", { done: summary.done, total: summary.total })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3.5">
            <Badge tone={status.tone} dot>
              {t(status.labelKey)}
            </Badge>
            {application.submitted_at ? (
              <span className="text-xs text-text-muted">
                {t("apply.statusBanner.submittedOn", { date: SUBMITTED_AT.format(new Date(application.submitted_at)) })}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {progress.map((step, index) => {
        const Section = SECTIONS[step.href]!;
        return (
          <section key={step.href} className={card}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <StepMark step={step} number={index + 1} t={t} />
              <h2 className="text-base font-extrabold text-text">{t(step.labelKey)}</h2>
              {editable ? (
                <Link
                  href={step.href}
                  aria-label={`${t("apply.review.edit")}: ${t(step.labelKey)}`}
                  className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full bg-signal-50 px-3 text-sm font-bold text-signal-700 hover:bg-signal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <Pencil size={13} aria-hidden />
                  {t("apply.review.edit")}
                </Link>
              ) : null}
            </div>
            <div className="flex flex-col gap-3.5 border-t border-line pt-3.5">
              <Section application={application} reference={reference} services={services} t={t} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * How much of the application is filled in: a ring that closes as steps are done, the count
 * inside. The full sentence is its accessible name.
 */
function ProgressRing({ done, total, label }: { done: number; total: number; label: string }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const complete = total > 0 && done >= total;
  return (
    <span role="img" aria-label={label} title={label} className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="4" className="stroke-line" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (total > 0 ? done / total : 0))}
          className={cn("transition-[stroke-dashoffset] duration-500", complete ? "stroke-success-text" : "stroke-action")}
        />
      </svg>
      <span aria-hidden className="text-xs font-extrabold tabular-nums text-text">
        {done}/{total}
      </span>
    </span>
  );
}

/**
 * The step's number circle doubles as its state: a tick when complete, "!" while something is
 * missing, the number when the step is optional. The words are its accessible name and tooltip.
 */
function StepMark({ step, number, t }: { step: StepProgress; number: number; t: T }) {
  const description =
    step.state === "done"
      ? t("common.done")
      : step.state === "optional"
        ? t("apply.shell.describe.optional")
        : t("apply.shell.describe.outstanding", { count: step.outstanding });
  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold",
        step.state === "done" && "bg-success-text text-surface",
        step.state === "todo" && "bg-warning-surface text-warning-text ring-1 ring-warning-line",
        step.state !== "done" && step.state !== "todo" && "bg-surface-sunken text-text-secondary",
      )}
    >
      {step.state === "done" ? <Check size={13} strokeWidth={3} aria-hidden /> : step.state === "todo" ? "!" : number}
    </span>
  );
}

/** Label beside value on wide screens, stacked on narrow ones. */
function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
      <span className={label}>{name}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A row of the employer's answers; a blank one says it is not set. */
function EmployerRow({ name, children, t }: { name: string; children: ReactNode; t: T }) {
  return (
    <Row name={name}>
      <p className={value}>{children || t("apply.review.notSet")}</p>
    </Row>
  );
}

/** An employer's "Who is hiring" step. */
function HiringAsSection({ application, t }: SectionProps) {
  const hiringAs = hiringAsOf(application.employer);
  return (
    <EmployerRow name={t("apply.steps.hiringAs")} t={t}>
      {hiringAs
        ? t(
            hiringAs === "INDIVIDUAL"
              ? "apply.employer.hiringAs.individual.title"
              : "apply.employer.hiringAs.business.title",
          )
        : ""}
    </EmployerRow>
  );
}

/** Someone hiring for themselves. The pin code and ID are Operations' to see, not candidates'. */
function IndividualSection({ application, t }: SectionProps) {
  const employer = application.employer;
  return (
    <>
      <EmployerRow name={t("apply.employer.field.name.label")} t={t}>
        {application.display_name}
      </EmployerRow>
      {employer?.email ? (
        <EmployerRow name={t("apply.employer.field.email.label")} t={t}>
          {employer.email}
        </EmployerRow>
      ) : null}
      <EmployerRow name={t("apply.employer.field.area.label")} t={t}>
        {employer?.area}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.field.city.label")} t={t}>
        {employer?.city}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.field.pinCode.label")} t={t}>
        {employer?.pin_code}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.field.idType.label")} t={t}>
        {employer?.id_document_type ? t(`apply.employer.field.idType.${employer.id_document_type}`) : ""}
      </EmployerRow>
    </>
  );
}

/** Someone hiring for a business: its names, kind, GST answer, proof and place. */
function BusinessSection({ application, t }: SectionProps) {
  const business = application.employer?.business;
  const size = SIZES.find((option) => option.value === business?.company_size)?.label;
  return (
    <>
      <EmployerRow name={t("apply.employer.business.tradeName.label")} t={t}>
        {business?.trade_name || business?.legal_name}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.legalName.label")} t={t}>
        {business?.legal_name}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.structure.label")} t={t}>
        {business?.legal_structure ? t(`apply.employer.business.structure.${business.legal_structure}`) : ""}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.industry.label")} t={t}>
        {business?.business_category ? t(`apply.employer.category.${business.business_category}`) : ""}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.size.label")} t={t}>
        {size}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.gst.label")} t={t}>
        {business?.gst_registered
          ? t("apply.employer.review.gstin", { gstin: business.gstin })
          : business?.business_proof_type
            ? t("apply.employer.review.noGst")
            : ""}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.proof.label")} t={t}>
        {business?.business_proof_type ? t(`apply.employer.business.proof.${business.business_proof_type}`) : ""}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.business.address.label")} t={t}>
        {[business?.address, business?.area, business?.city, business?.state, business?.pin_code]
          .filter(Boolean)
          .join(", ")}
      </EmployerRow>
      {business?.website_url ? (
        <EmployerRow name={t("apply.employer.business.website.label")} t={t}>
          {business.website_url}
        </EmployerRow>
      ) : null}
    </>
  );
}

/** The person posting the jobs for a business. */
function ContactSection({ application, t }: SectionProps) {
  const employer = application.employer;
  return (
    <>
      <EmployerRow name={t("apply.employer.field.name.label")} t={t}>
        {application.display_name}
      </EmployerRow>
      <EmployerRow name={t("apply.employer.contact.role.label")} t={t}>
        {employer?.poster_role ? t(`apply.employer.contact.role.${employer.poster_role}`) : ""}
      </EmployerRow>
      {employer?.email ? (
        <EmployerRow name={t("apply.employer.field.email.label")} t={t}>
          {employer.email}
        </EmployerRow>
      ) : null}
      <EmployerRow name={t("apply.employer.field.idType.label")} t={t}>
        {employer?.id_document_type ? t(`apply.employer.field.idType.${employer.id_document_type}`) : ""}
      </EmployerRow>
    </>
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
