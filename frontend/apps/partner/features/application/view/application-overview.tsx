"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton, cn, useT, type Translator } from "@vsolve/ui";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Check,
  ChevronRight,
  FileText,
  Package,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { canSubmit, isEditable, rejectedDocuments } from "../model/readiness";
import { usePartnerApplication, useUpdateApplication } from "../queries";
import { ApplicationStatusBanner } from "./status-banner";
import { DocumentUpload } from "./document-upload";

/**
 * Where the application stands, and the one thing to do next.
 *
 * ## What it replaces
 *
 * A heading, a status banner, a flat checklist of seven requirements, three
 * separate bordered blocks of links, and — at the bottom — a raw dump of the
 * status machine: `DRAFT → SUBMITTED` rendered as literal enum strings, to an
 * applicant. Nothing on the screen said how far along they were, and the
 * primary action was a link that said "Continue" without saying continue to
 * what.
 *
 * ## The shape now
 *
 * One number, one button, then detail. The number is the same
 * `progressSummary` the shell's bar reads, so the hub and the header can never
 * disagree. The button goes to the first unfinished step by name — "Next: your
 * documents" — because "Continue" is only useful to somebody who already
 * remembers where they stopped.
 *
 * Submitting still lives on `/apply/review` rather than here. One place that
 * sends an application means one place that has to get the confirmation, the
 * conflict recovery and the "you are not approved yet" wording right.
 */

type Application = Schemas["PartnerApplication"];

export function ApplicationOverview() {
  const t = useT();
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <div role="status" aria-label={t("apply.editor.loadingAriaLabel")} className="flex flex-col gap-4">
        <div aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-14 w-full rounded-control" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void query.refetch()}
      />
    );
  }

  if (isMissing || query.data === undefined) return <NotStarted />;

  return <Standing application={query.data} />;
}

/**
 * Nobody has applied yet.
 *
 * The only screen in this tree that is allowed to be a pitch, and it stays a
 * short one. The first question decides the path: someone listing their own
 * property skips the trades, areas and hours that only matter for people who
 * travel to a customer.
 */
function NotStarted() {
  const t = useT();
  const router = useRouter();
  const start = useUpdateApplication();

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-5 py-7 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface/15 text-surface">
          <Sparkles size={26} aria-hidden />
        </span>
        <h1 className="text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-surface">
          {t("apply.overview.notStarted.title")}
        </h1>
        <p className="max-w-[32ch] text-[0.9375rem] leading-relaxed text-navy-200">
          {t("apply.overview.notStarted.subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-bold text-navy-900">{t("apply.overview.notStarted.whatWillYouDo")}</h2>
        <p className="text-sm text-text-secondary">{t("apply.overview.notStarted.tapToStart")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TrackCard
          href="/apply/about"
          icon={<Wrench size={22} aria-hidden />}
          title={t("apply.overview.track.services.title")}
          description={t("apply.overview.track.services.description")}
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "STAY_HOST" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<BedDouble size={22} aria-hidden />}
          title={t("apply.overview.track.stays.title")}
          description={t("apply.overview.track.stays.description")}
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "RENTAL_OWNER" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<Package size={22} aria-hidden />}
          title={t("apply.overview.track.rentals.title")}
          description={t("apply.overview.track.rentals.description")}
        />
      </div>
      {start.isError ? (
        <p className="text-sm text-danger-text">{t("apply.overview.startFailed")}</p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        <Promise>{t("apply.overview.promise.notSentUntilYouSend")}</Promise>
        <Promise>{t("apply.overview.promise.notSharedUntilApproved")}</Promise>
      </ul>
    </section>
  );
}

/**
 * One way to join, drawn as something you tap.
 *
 * These used to be bare bordered panels — on a phone, with no hover, they read
 * as information and an applicant asked where to apply. The trailing chevron
 * and the pressed state are what say "this opens something".
 */
function TrackCard({
  icon,
  title,
  description,
  href,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
} & ({ href: string; onClick?: never; disabled?: never } | { href?: never; onClick: () => void; disabled: boolean })) {
  const className =
    "group flex items-center gap-3.5 rounded-card border border-line bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow,transform] hover:border-action hover:shadow-sm active:scale-[0.99] active:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60";
  const body = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center self-start rounded-control bg-action-surface text-action">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-navy-900">{title}</span>
        <span className="text-sm text-text-secondary">{description}</span>
      </span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-navy-900 transition-colors group-hover:bg-action group-hover:text-surface group-active:bg-action group-active:text-surface">
        <ChevronRight size={18} aria-hidden />
      </span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function Promise({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed text-text-secondary">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-surface text-success-text">
        <Check size={13} strokeWidth={3} aria-hidden />
      </span>
      {children}
    </li>
  );
}

function Standing({ application }: { application: Application }) {
  const t = useT();
  const steps = stepProgress(application);
  const summary = progressSummary(application);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application);

  return (
    <section className="flex flex-col gap-6 pb-20">
      <h1 className="sr-only">{t("apply.overview.heading")}</h1>

      {/* Responsive 2-column layout on Desktop */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start w-full min-w-0">
        {/* Left Column (7 cols): Status Banner, Rejected docs, Hero Action, Specialist options, History */}
        <div className="flex flex-col gap-6 w-full min-w-0 lg:col-span-7 xl:col-span-8">
          <ApplicationStatusBanner application={application} />

          {/* Reviewer Rejections Alarm with In-Card Re-Upload */}
          {rejected.length > 0 ? (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warning-line bg-warning-surface p-5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning-line/40 text-warning-text">
                  <AlertTriangle size={18} aria-hidden />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-warning-text">
                    {t("apply.overview.rejected.heading", { count: rejected.length })}
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Please re-upload the rejected documents below. You can upload directly in each card.
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-3">
                {rejected.map((document) => {
                  const label = documentLabel(document.kind, t);
                  return (
                    <div
                      key={document.id}
                      className="rounded-2xl border border-line bg-surface p-4 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-navy-700" aria-hidden />
                          <p className="text-sm font-bold text-navy-900">{label}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full border border-danger-line bg-danger-surface px-2.5 py-0.5 text-[11px] font-bold text-danger-text">
                          <AlertCircle size={12} aria-hidden />
                          Action Required
                        </span>
                      </div>

                      {document.review_reason ? (
                        <div className="mt-2.5 rounded-xl border border-warning-line/60 bg-warning-surface/60 p-3 text-xs text-text-secondary flex items-start gap-2">
                          <AlertCircle size={15} className="text-warning-text shrink-0 mt-0.5" aria-hidden />
                          <div>
                            <strong className="font-bold text-navy-900">Reviewer Note: </strong>
                            <span>{document.review_reason}</span>
                          </div>
                        </div>
                      ) : null}

                      {/* Direct In-Card Re-Upload Control */}
                      <div className="mt-3">
                        <DocumentUpload
                          kind={document.kind}
                          label={label}
                          expectedVersion={application.version}
                          replacing={true}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Primary Progress Hero Card or Submitted Under-Review Hero */}
          {editable ? (
            <NextAction summary={summary} ready={ready} />
          ) : application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? (
            <SubmittedHero />
          ) : null}

          {/* Specialist & Contractor Option — not for someone listing their own property. */}
          {application.track === "STAY_HOST" || application.track === "RENTAL_OWNER" ? null : (
            <section className="rounded-3xl border border-line bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-navy-900">{t("apply.overview.crew.title")}</h2>
                  <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[10px] font-bold text-text-muted border border-line shrink-0">
                    {t("common.optional")}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 max-w-md leading-relaxed">
                  {t("apply.overview.crew.description")}
                </p>
              </div>
              <Link
                href="/apply/capabilities"
                className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-surface-sunken px-5 text-xs font-bold text-navy-900 transition-colors shadow-xs w-full sm:w-auto shrink-0"
              >
                <span>{t("apply.overview.crew.cta")}</span>
              </Link>
            </section>
          )}

          {application.status === "APPROVED" ? (
            <Approved track={application.track} />
          ) : null}

          <History transitions={application.transitions} />
        </div>

        {/* Right Column (5 cols): Step Checklist & Desktop Helper */}
        <div className="flex flex-col gap-6 w-full min-w-0 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-28">
          <StepList steps={steps} application={application} />

          {/* Desktop Registration Guide Box */}
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Sparkles size={16} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-navy-900">Registration Hub</h3>
                <p className="text-[11px] text-text-secondary">Desktop Verification Mode</p>
              </div>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Complete your verification on desktop. Once your application and KYC documents are approved, daily jobs and dispatches will be unlocked on the VSOLVE Partner Mobile App.
            </p>
            <div className="pt-2 border-t border-line text-[11px] font-semibold text-text-muted flex items-center justify-between">
              <span>Need help?</span>
              <Link href="/contact" className="text-navy-900 underline hover:text-signal-700">
                Contact Partner Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Modern Progress Hero Card
 */
function NextAction({
  summary,
  ready,
}: {
  summary: ReturnType<typeof progressSummary>;
  ready: boolean;
}) {
  const t = useT();
  const percent = Math.round(summary.fraction * 100);
  const remaining = summary.total - summary.done;
  const rawStepName = summary.nextIncomplete
    ? t(summary.nextIncomplete.labelKey).toLowerCase()
    : t("apply.steps.documents").toLowerCase();
  const cleanStepName = rawStepName.replace(/^your\s+/i, "");

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#00112e] text-white p-5 sm:p-8 shadow-2xl border border-white/10 flex flex-col gap-5 sm:gap-6 min-w-0">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 rounded-full bg-signal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute left-0 bottom-0 h-44 w-44 -translate-x-1/4 translate-y-1/4 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Top Status & Count Row */}
      <div className="relative z-10 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal-500" />
          </span>
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-300 truncate">
            {t("apply.overview.hero.progressLabel")}
          </span>
        </div>

        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] sm:text-xs font-extrabold text-white border border-white/20 shadow-xs tabular-nums shrink-0 whitespace-nowrap">
          {ready
            ? t("apply.overview.hero.statusAllDone")
            : t("apply.overview.hero.statusCount", { done: summary.done, total: summary.total })}
        </span>
      </div>

      {/* Headline & Description */}
      <div className="relative z-10 min-w-0">
        <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight">
          {ready
            ? t("apply.overview.hero.completeHeadline")
            : t("apply.overview.hero.remainingHeadline", { count: remaining })}
        </h2>
        <p className="text-xs sm:text-sm text-navy-200 mt-1.5 sm:mt-2 leading-relaxed max-w-lg">
          {ready
            ? t("apply.overview.hero.completeBody")
            : t("apply.overview.hero.remainingBody", {
                step: cleanStepName,
              })}
        </p>
      </div>

      {/* Progress Track */}
      <div className="relative z-10 flex flex-col gap-2 pt-1 min-w-0">
        <div className="flex items-center justify-between text-xs font-bold text-navy-200">
          <span>{t("apply.overview.hero.overallCompletion")}</span>
          <span className="text-amber-400 font-black text-sm">{percent}%</span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-white/15 p-0.5"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-signal-500 via-amber-400 to-amber-300 transition-all duration-700 shadow-xs"
            style={{ width: `${Math.max(6, percent)}%` }}
          />
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="relative z-10 pt-1">
        <Link
          href={ready ? "/apply/review" : (summary.nextIncomplete?.href ?? "/apply/review")}
          className="flex h-12 sm:h-13 w-full items-center justify-center rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-5 text-sm font-extrabold text-[#00112e] shadow-xl shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 hover:scale-[1.01] transition-all active:scale-[0.99] text-center"
        >
          <span className="truncate">
            {ready
              ? t("apply.overview.hero.ctaReview")
              : t("apply.overview.hero.ctaContinue", {
                  step: summary.nextIncomplete ? t(summary.nextIncomplete.labelKey) : t("apply.steps.review"),
                })}
          </span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Modern Hero Card for Submitted / Under Review applications
 */
function SubmittedHero() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#00112e] text-white p-5 sm:p-8 shadow-2xl border border-white/10 flex flex-col gap-5 min-w-0">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute left-0 bottom-0 h-44 w-44 -translate-x-1/4 translate-y-1/4 rounded-full bg-cyan-500/15 blur-3xl" />

      {/* Top Status & Count Row */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
            Registration Submitted
          </span>
        </div>

        <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-300">
          In Verification Queue
        </span>
      </div>

      {/* Headline & Body */}
      <div className="relative z-10 flex flex-col gap-2">
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Application Received & Under Review
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
          Thank you for applying! Our operations team is verifying your Government ID and address credentials. Verification turnaround is typically within 24 hours.
        </p>
      </div>

      {/* Action shortcuts */}
      <div className="relative z-10 flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
        <Link
          href="/apply/review"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-4 text-xs font-bold text-white transition-colors"
        >
          <FileText size={14} />
          <span>Review Submitted Record</span>
        </Link>
        <Link
          href="/me/documents"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-4 text-xs font-bold text-white transition-colors"
        >
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Application & KYC Documents</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Clean & Modern Steps Checklist
 */
function StepList({
  steps,
  application,
}: {
  steps: readonly StepProgress[];
  application?: Application;
}) {
  const t = useT();
  const rows = steps.filter((step) => step.state !== "waypoint");

  const activeDocs = (application?.documents ?? []).filter((d) => d.status !== "SUPERSEDED");
  const hasRejectedDocs = activeDocs.some(
    (d) => d.status === "REJECTED" || d.scan_status === "REJECTED",
  );
  const hasPendingDocs = activeDocs.some((d) => d.status === "PENDING");
  const approvedDocsCount = activeDocs.filter((d) => d.status === "APPROVED").length;
  const allDocsApproved = activeDocs.length >= 2 && activeDocs.every((d) => d.status === "APPROVED");

  // Only the single first incomplete step gets "Next Up"
  const firstIncompleteStep = rows.find(
    (step) => step.state !== "done" && step.state !== "optional",
  );
  const nextStepHref = firstIncompleteStep?.href;

  return (
    <section className="flex flex-col gap-3 mt-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-black uppercase tracking-wider text-navy-900">
          {t("apply.overview.checklist.heading")}
        </h2>
        {/*
          "Tap", not "Click". Onboarding is a phone flow — the shell that wraps
          it is a 375px column — and a vendor filling this in on site is not
          clicking anything.
        */}
        <span className="text-xs font-semibold text-text-secondary">
          {t("apply.overview.checklist.tapHint")}
        </span>
      </div>

      <div className="rounded-3xl border border-line bg-white shadow-xs overflow-hidden divide-y divide-line">
        {rows.map((step, idx) => {
          const isDocumentStep = step.href === "/apply/documents";
          const isDone = step.state === "done";
          const isOptional = step.state === "optional";

          // Compute realistic document verification state
          let docStatus: "rejected" | "pending" | "approved" | "incomplete" = "incomplete";
          if (isDocumentStep) {
            if (hasRejectedDocs) {
              docStatus = "rejected";
            } else if (hasPendingDocs) {
              docStatus = "pending";
            } else if (allDocsApproved) {
              docStatus = "approved";
            } else if (isDone) {
              docStatus = "pending";
            }
          }

          // Next Up applies strictly to the single first incomplete step (never to rejected docs)
          const isNext = step.href === nextStepHref && docStatus !== "rejected";

          // Indicator icon
          let indicator;
          if (isDocumentStep) {
            if (docStatus === "rejected") {
              indicator = (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-700 border border-rose-200 shadow-xs">
                  <AlertCircle size={18} aria-hidden />
                </div>
              );
            } else if (docStatus === "pending") {
              indicator = (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200 shadow-xs">
                  <Clock size={17} aria-hidden />
                </div>
              );
            } else if (docStatus === "approved") {
              indicator = (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                  <Check size={18} strokeWidth={3} aria-hidden />
                </div>
              );
            } else {
              indicator = (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface-sunken text-text-muted border border-line text-xs font-black">
                  <span>{idx + 1}</span>
                </div>
              );
            }
          } else if (isDone) {
            indicator = (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                <Check size={18} strokeWidth={3} aria-hidden />
              </div>
            );
          } else if (isNext) {
            indicator = (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-signal-500 text-white shadow-md shadow-signal-500/25 text-xs font-black">
                <span>{idx + 1}</span>
              </div>
            );
          } else {
            indicator = (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface-sunken text-text-muted border border-line text-xs font-black">
                <span>{idx + 1}</span>
              </div>
            );
          }

          // Subtitle (crisp, single line, no awkward wraps)
          let subtitle: string;
          if (isDocumentStep) {
            if (docStatus === "rejected") {
              subtitle = "Action required • Needs re-upload";
            } else if (docStatus === "pending") {
              subtitle =
                approvedDocsCount > 0
                  ? `${approvedDocsCount} of 2 verified • Under review`
                  : "Waiting for Operations review";
            } else if (docStatus === "approved") {
              subtitle = "All documents verified & approved";
            } else {
              subtitle = t("apply.overview.checklist.outstanding", { count: step.outstanding });
            }
          } else if (isDone) {
            subtitle = "Completed";
          } else if (isOptional) {
            subtitle = t("apply.overview.checklist.optionalSchedule");
          } else {
            subtitle = t("apply.overview.checklist.outstanding", { count: step.outstanding });
          }

          // Perfectly aligned right badge (uniform min-w-[6.5rem], centered, single badge per row)
          let badge;
          if (isDocumentStep) {
            if (docStatus === "rejected") {
              badge = (
                <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-800 shadow-2xs whitespace-nowrap">
                  Action Required
                </span>
              );
            } else if (docStatus === "pending") {
              badge = (
                <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 shadow-2xs whitespace-nowrap">
                  Waiting for review
                </span>
              );
            } else if (docStatus === "approved") {
              badge = (
                <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs whitespace-nowrap">
                  Verified
                </span>
              );
            } else {
              badge = (
                <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1 text-xs font-bold text-text-muted whitespace-nowrap">
                  {t("apply.overview.checklist.incomplete")}
                </span>
              );
            }
          } else if (isDone) {
            badge = (
              <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs whitespace-nowrap">
                {t("common.done")}
              </span>
            );
          } else if (isNext) {
            badge = (
              <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-signal-200 bg-signal-50 px-3 py-1 text-xs font-extrabold text-signal-800 shadow-2xs whitespace-nowrap">
                {t("apply.overview.checklist.nextUp")}
              </span>
            );
          } else if (isOptional) {
            badge = (
              <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1 text-xs font-bold text-text-muted whitespace-nowrap">
                {t("common.optional")}
              </span>
            );
          } else {
            badge = (
              <span className="inline-flex min-w-[6.5rem] items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1 text-xs font-bold text-text-muted whitespace-nowrap">
                {t("apply.overview.checklist.incomplete")}
              </span>
            );
          }

          return (
            <Link
              key={step.href}
              href={step.href}
              className={cn(
                "flex items-center justify-between gap-3 p-4 sm:p-4.5 transition-all duration-200 group",
                isNext ? "bg-signal-50/25 hover:bg-signal-50/50" : "hover:bg-surface-sunken/60",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
              )}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {indicator}

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-navy-900 group-hover:text-signal-700 transition-colors truncate">
                    {t(step.labelKey)}
                  </span>
                  <span className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</span>
                </div>
              </div>

              <div className="flex items-center justify-end shrink-0 pl-2">{badge}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}


/**
 * Approval is the moment there is somewhere to go, not the moment the links
 * disappear.
 *
 * The screen used to end here for an approved Partner: every outgoing link was
 * gated on `isEditable`, which is false once APPROVED, so the page collapsed to
 * a banner and a history — and the banner's own "publish the hours you want to
 * work" pointed at nothing.
 */
function Approved({ track }: { track: Application["track"] }) {
  const t = useT();
  if (track === "RENTAL_OWNER") {
    return (
      <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
        <p className="text-[0.9375rem] font-bold text-success-text">{t("apply.overview.approved.heading")}</p>
        <p className="text-[0.875rem] leading-relaxed text-success-text/85">
          {t("apply.overview.approved.rental.body")}
        </p>
        <Link
          href="/rentals"
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {t("apply.overview.approved.rental.cta")}
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    );
  }
  if (track === "STAY_HOST") {
    return (
      <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
        <p className="text-[0.9375rem] font-bold text-success-text">{t("apply.overview.approved.heading")}</p>
        <p className="text-[0.875rem] leading-relaxed text-success-text/85">
          {t("apply.overview.approved.stay.body")}
        </p>
        <Link
          href="/stays"
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {t("apply.overview.approved.stay.cta")}
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
      <p className="text-[0.9375rem] font-bold text-success-text">{t("apply.overview.approved.heading")}</p>
      <p className="text-[0.875rem] leading-relaxed text-success-text/85">
        {t("apply.overview.approved.services.body")}
      </p>
      {/* `/home` directly: `/dashboard` and `/work` both redirect there, and the
          duty control lives on it. `/availability` — which this used to point
          at — is a redirect to `/me`, and `/me` is a settings hub rather than
          the screen a newly-approved Partner wants first. */}
      <Link
        href="/home"
        className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {t("apply.overview.approved.services.cta")}
        <ArrowRight size={18} aria-hidden />
      </Link>
    </div>
  );
}

function documentLabel(kind: Schemas["PartnerDocumentKindEnum"], t: Translator["t"]): string {
  switch (kind) {
    case "GOVERNMENT_ID":
      return t("apply.requirements.governmentId");
    case "ADDRESS_PROOF":
      return t("apply.requirements.addressProof");
    case "TAX":
      return t("apply.overview.documentLabels.tax");
    case "BANK":
      return t("apply.overview.documentLabels.bank");
    case "BACKGROUND_CHECK":
      return t("apply.overview.documentLabels.backgroundCheck");
    case "OTHER":
      return t("apply.overview.documentLabels.other");
  }
}

/**
 * What has happened, in words.
 *
 * This used to render `transition.from_status + " → " + transition.to_status`,
 * so an applicant read `DRAFT → SUBMITTED` and `UNDER_REVIEW → CHANGES_REQUIRED`
 * — the status machine's own vocabulary, printed unchanged onto the screen of
 * somebody who has never seen it. Each transition is a sentence now.
 *
 * The reviewer's `reason` is still rendered verbatim beneath it. That string is
 * written by a person for this applicant and is the only part of a transition
 * worth reading twice; nothing here summarises it.
 *
 * An unknown status falls back to the raw pair rather than being dropped. A
 * newer deployment can introduce one, and a history with a silent gap in it is
 * worse than a history with one unpolished line.
 */
function History({ transitions }: { transitions: Application["transitions"] }) {
  const t = useT();
  if (transitions.length === 0) return null;

  return (
    <section>
      <h2 className="pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        {t("apply.overview.history.heading")}
      </h2>
      <ol className="flex list-none flex-col gap-0 p-0">
        {[...transitions].reverse().map((transition, index) => (
          <li key={transition.id} className="flex gap-3">
            <span aria-hidden className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                  index === 0 ? "bg-action" : "bg-line-strong",
                )}
              />
              {index === transitions.length - 1 ? null : (
                <span className="w-px flex-1 bg-line" />
              )}
            </span>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-[0.9375rem] font-semibold text-text">
                {describeTransition(transition.from_status, transition.to_status, t)}
              </p>
              {transition.reason ? (
                <p className="mt-0.5 text-[0.875rem] leading-relaxed text-text-secondary">
                  {transition.reason}
                </p>
              ) : null}
              <time
                dateTime={transition.occurred_at}
                className="mt-1 block text-[0.75rem] text-text-muted"
              >
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(transition.occurred_at))}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What arriving at each status actually meant for the applicant. */
const ARRIVED_KEY: Record<string, string> = {
  DRAFT: "apply.overview.history.arrived.DRAFT",
  SUBMITTED: "apply.overview.history.arrived.SUBMITTED",
  UNDER_REVIEW: "apply.overview.history.arrived.UNDER_REVIEW",
  CHANGES_REQUIRED: "apply.overview.history.arrived.CHANGES_REQUIRED",
  APPROVED: "apply.overview.history.arrived.APPROVED",
  SUSPENDED: "apply.overview.history.arrived.SUSPENDED",
  OFFBOARDED: "apply.overview.history.arrived.OFFBOARDED",
  DECLINED: "apply.overview.history.arrived.DECLINED",
};

function describeTransition(from: string, to: string, t: Translator["t"]): string {
  // A reviewer handing it back to the queue, not the applicant sending it again.
  if (from === "UNDER_REVIEW" && to === "SUBMITTED") return t("apply.overview.history.backToQueue");
  if (from === "SUSPENDED" && to === "APPROVED") return t("apply.overview.history.reinstated");
  const key = ARRIVED_KEY[to];
  return key ? t(key) : `${from} → ${to}`;
}
