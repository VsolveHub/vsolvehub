"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Badge, Button, buttonStyles, cn, ErrorState, Spinner, useT } from "@vsolve/ui";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit2,
  User,
  Wrench,
  MapPin,
  FileCheck,
  FileText,
  RefreshCw,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { toDraft, weeklyHours, WEEKDAY_KEYS } from "../model/schedule";
import { isListingTrack } from "../model/steps";
import {
  isVersionConflict,
  usePartnerApplication,
  usePartnerAvailability,
  useSubmitApplication,
} from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ApplicationStatusBanner } from "./status-banner";
import { RegistrationSuccessModal } from "./registration-success-modal";

function SectionEditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-navy-700 transition-colors hover:border-navy-700 hover:bg-surface-hover hover:text-signal-700"
    >
      <Edit2 className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function ReviewStep() {
  const router = useRouter();
  const query = usePartnerApplication();
  const availability = usePartnerAvailability();
  const reference = useApplicationReference();
  const submit = useSubmitApplication();
  const [confirmed, setConfirmed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const t = useT();

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending || availability.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        {t("apply.review.loading")}
      </p>
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

  const application = query.data ?? null;

  if (application === null) {
    return (
      <section className="rounded-card bg-surface p-6 border border-line text-center">
        <h1 className="text-xl font-bold text-text">{t("apply.review.notStarted.title")}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t("apply.review.notStarted.body")}
        </p>
        <Link
          href="/apply/about"
          className="mt-4 inline-flex items-center gap-2 rounded-control bg-action px-6 py-2.5 text-sm font-bold text-action-text"
        >
          {t("apply.review.notStarted.cta")}
        </Link>
      </section>
    );
  }

  const listing = isListingTrack(application.track);
  const outstanding = outstandingRequirements(application, availability.data);
  const ready = canSubmit(application, availability.data);
  const activeConsents = application.consents.filter(
    (consent) => consent.withdrawn_at === null,
  );

  // Lookup maps for human readable labels
  const skillNameMap = new Map(reference.skills.map((s) => [s.code, s.name]));
  const areaNameMap = new Map(reference.serviceAreas.map((a) => [a.id, a.name]));

  const documents = application.documents.filter((d) => d.status !== "SUPERSEDED");
  const hasRejectedDocs = documents.some(
    (d) => d.status === "REJECTED" || d.scan_status === "REJECTED",
  );

  return (
    <section className="flex flex-col gap-6 pb-20">
      <div>
        <h1 className="text-2xl font-extrabold text-text tracking-tight">{t("apply.review.heading")}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("apply.review.subheading")}
        </p>
      </div>

      <ApplicationStatusBanner application={application} />

      {/* Outstanding requirements notice if not ready */}
      {!ready && (
        <div className="rounded-card border border-warning-line bg-warning-surface p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-warning-text">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t("apply.review.outstandingNotice")}</span>
          </div>
          {/*
            These are the only way to reach the step that is blocking
            submission, so they have to be thumb-sized. As bare inline text they
            were 15px tall; `inline-flex min-h-11` gives the row real height
            without changing the list's look.
          */}
          <ul className="mt-2 pl-6 list-disc text-xs font-semibold text-warning-text/90">
            {outstanding.map((req) => (
              <li key={req.code}>
                <Link
                  href={req.href}
                  className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-navy-900"
                >
                  {t(req.labelKey)} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 1: Personal Profile */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section1.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/about" label={t("apply.review.section1.editAria")} />
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-xs font-bold text-text-muted uppercase">{t("apply.review.displayNameLabel")}</span>
            <p className="font-bold text-text mt-0.5">
              {application.display_name || <span className="text-text-muted italic">{t("apply.review.notSet")}</span>}
            </p>
          </div>
          {listing ? null : (
            <div>
              <span className="text-xs font-bold text-text-muted uppercase">{t("apply.review.experienceLabel")}</span>
              <p className="font-bold text-text mt-0.5">
                {t("apply.review.experienceYears", { count: application.experience_years })}
              </p>
            </div>
          )}
          <div className="sm:col-span-2">
            <span className="text-xs font-bold text-text-muted uppercase">{t("apply.review.bioLabel")}</span>
            <p className="text-xs leading-relaxed text-text-secondary mt-1 whitespace-pre-line bg-surface-sunken p-3 rounded-control border border-line">
              {application.biography || t("apply.review.noBio")}
            </p>
          </div>
        </div>
      </div>

      {listing ? null : (
      <>
      {/* Section 2: Trades & Services */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section2.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/work" label={t("apply.review.section2.editAria")} />
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div>
            <span className="text-xs font-bold text-text-muted uppercase">{t("apply.review.selectedTrades")}</span>
            {application.skill_codes.length === 0 ? (
              <p className="text-xs text-danger-text mt-1 font-semibold">{t("apply.review.noTradeSelected")}</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {application.skill_codes.map((code) => (
                  <span
                    key={code}
                    className="rounded-full bg-navy-100 px-3 py-1 text-xs font-bold text-navy-800 border border-navy-200"
                  >
                    {skillNameMap.get(code) ?? code}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-text-muted uppercase">{t("apply.review.acceptedJobTypes")}</span>
            <p className="text-xs text-text-secondary mt-0.5 font-semibold">
              {t("apply.review.variantsSelected", { count: application.service_variant_ids.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Service Areas */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section3.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/areas" label={t("apply.review.section3.editAria")} />
          ) : null}
        </div>

        <div className="mt-4">
          {application.service_area_ids.length === 0 ? (
            <p className="text-xs text-danger-text font-semibold">{t("apply.review.noAreaSelected")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {application.service_area_ids.map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-bold text-text border border-line flex items-center gap-1"
                >
                  <MapPin className="h-3 w-3 text-signal-500" />
                  <span>{areaNameMap.get(id) ?? t("apply.review.zoneFallback", { id: id.slice(0, 8) })}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Working Hours */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section4.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/schedule" label={t("apply.review.section4.editAria")} />
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {application.service_area_ids.length === 0 ? (
            <p className="text-xs text-text-muted">{t("apply.review.hours.selectAreaFirst")}</p>
          ) : (
            application.service_area_ids.map((areaId) => {
              const areaName = areaNameMap.get(areaId) ?? t("apply.schedule.areaFallback", { id: areaId.slice(0, 8) });
              const areaRules = (availability.data?.rules ?? []).filter(
                (r) => r.service_area_id === areaId && r.is_active,
              );
              const areaDrafts = toDraft(areaRules);
              const totalHours = weeklyHours(areaDrafts);

              if (areaRules.length === 0) {
                return (
                  <div
                    key={areaId}
                    className="flex flex-col gap-2 rounded-control border border-danger-line bg-danger-surface/20 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-navy-900">{areaName}</span>
                      <Badge tone="danger">{t("apply.schedule.noHoursSet")}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-danger-text font-semibold">
                      <span>{t("apply.review.hours.noHoursWarning")}</span>
                      <Link
                        href="/apply/schedule"
                        className="underline underline-offset-2 font-bold shrink-0 hover:text-navy-900"
                      >
                        {t("apply.review.hours.editLink")}
                      </Link>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={areaId}
                  className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-navy-900">{areaName}</span>
                    <Badge tone="success" className="tabular-nums font-bold">
                      {t("apply.review.hours.summary", { hours: totalHours, count: areaRules.length })}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-text-secondary">
                    {WEEKDAY_KEYS.map((dayKey, dayIdx) => {
                      const dayRules = areaRules.filter((r) => r.weekday === dayIdx);
                      if (dayRules.length === 0) return null;
                      return (
                        <span
                          key={dayKey}
                          className="rounded bg-surface px-2 py-0.5 border border-line text-[11px] font-medium"
                        >
                          <strong className="text-navy-900">{t(dayKey)}:</strong>{" "}
                          {dayRules
                            .map(
                              (r) =>
                                `${r.starts_at.slice(0, 5)}–${r.ends_at.slice(0, 5)}${
                                  r.ends_next_day ? " (+1)" : ""
                                }`,
                            )
                            .join(", ")}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}

      {/* Section 5: Documents */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section5.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/documents" label={t("apply.review.section5.editAria")} />
          ) : hasRejectedDocs ? (
            <Link
              href="/apply/documents"
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 text-xs shadow-xs transition active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Re-upload</span>
            </Link>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {documents.length === 0 ? (
            <p className="text-xs text-danger-text font-semibold">{t("apply.review.noDocuments")}</p>
          ) : (
            documents.map((doc) => {
              const isRejected = doc.status === "REJECTED" || doc.scan_status === "REJECTED";
              return (
                <div
                  key={doc.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-control p-3 border text-xs font-semibold transition-colors",
                    isRejected
                      ? "bg-rose-50/70 border-rose-200"
                      : "bg-surface-sunken border border-line"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {isRejected ? (
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      ) : doc.status === "APPROVED" ? (
                        <CheckCircle2 className="h-4 w-4 text-success-text shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-sky-600 shrink-0" />
                      )}
                      <span className={cn("capitalize", isRejected ? "text-rose-950 font-bold" : "text-navy-900")}>
                        {doc.kind.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone={doc.status === "APPROVED" ? "success" : isRejected ? "danger" : "info"}>
                        {doc.status === "APPROVED"
                          ? "Approved"
                          : isRejected
                            ? "Rejected"
                            : "Waiting for review"}
                      </Badge>

                      {isRejected && (
                        <Link
                          href="/apply/documents"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 text-xs shadow-xs transition active:scale-95 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Re-upload</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {isRejected && doc.review_reason && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-white/90 p-2.5 text-[11px] text-rose-800 border border-rose-200/70 font-medium">
                      <span className="font-bold shrink-0">Reviewer Note:</span>
                      <span>{doc.review_reason}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Section 6: Agreements */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">{t("apply.review.section6.title")}</h2>
          </div>
          {isEditable(application) ? (
            <SectionEditLink href="/apply/consent" label={t("apply.review.section6.editAria")} />
          ) : null}
        </div>

        <div className="mt-3">
          {activeConsents.length > 0 ? (
            <ul className="space-y-1 text-xs text-text-secondary">
              {activeConsents.map((consent) => (
                <li key={consent.id} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />
                  <span>{t("apply.review.accepted", { purpose: consent.purpose.replace(/_/g, " "), version: consent.document_version })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-warning-text font-semibold">
              {t("apply.review.noAgreements")}
            </p>
          )}
        </div>
      </div>

      {/* Submission Actions */}
      {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-50/60 p-6 sm:p-8 text-center flex flex-col items-center gap-3 shadow-xs mt-2">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-2">
              <Clock size={12} /> {t("apply.review.submitted.badge")}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-navy-900 tracking-tight">
              {t("apply.review.submitted.title")}
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-md mx-auto leading-relaxed">
              {t("apply.review.submitted.body")}
            </p>
          </div>
          <Link
            href="/apply"
            className={buttonStyles({ size: "lg", className: "font-bold text-sm h-12 px-7 mt-2 shadow-sm" })}
          >
            {t("apply.review.submitted.cta")}
          </Link>
        </div>
      ) : isEditable(application) ? (
        <div className="rounded-card border border-line bg-surface p-6 shadow-md mt-2">
          {isVersionConflict(submit.error) ? (
            <ErrorState
              inline
              className="mb-4"
              severity="warning"
              title={t("apply.review.conflict.title")}
              message={t("apply.review.conflict.message")}
            />
          ) : submit.isError ? (
            <ErrorState
              inline
              className="mb-4"
              title={t("apply.review.submitError.title")}
              message={
                submit.error instanceof ApiRequestError && submit.error.message
                  ? submit.error.message
                  : t("apply.review.submitError.message")
              }
              reference={
                submit.error instanceof ApiRequestError ? submit.error.requestId : null
              }
            />
          ) : null}

          <div className="flex flex-col gap-4">
            {/* Highlighted Certification Box */}
            <label
              className={cn(
                "group relative flex items-start gap-3.5 rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer select-none border-2",
                confirmed
                  ? "border-emerald-400 bg-emerald-50/75 shadow-xs"
                  : "border-amber-300 bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-orange-50/60 shadow-xs hover:border-amber-400 hover:shadow-sm"
              )}
            >
              <div className="pt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  aria-describedby="certification-description"
                  className={cn(
                    "h-6 w-6 rounded-lg transition-all cursor-pointer",
                    confirmed
                      ? "border-emerald-500 text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                      : "border-amber-400 text-amber-600 accent-amber-600 focus:ring-amber-500 ring-2 ring-amber-300/40"
                  )}
                />
              </div>

              <div className="flex flex-1 flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-sm font-extrabold leading-tight",
                      confirmed ? "text-emerald-950" : "text-navy-950"
                    )}
                  >
                    Declaration & Accuracy Guarantee
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider transition-colors",
                      confirmed
                        ? "bg-emerald-200/90 text-emerald-900 border border-emerald-300"
                        : "bg-amber-200/90 text-amber-950 border border-amber-300 animate-pulse"
                    )}
                  >
                    {confirmed ? "✓ Confirmed" : "Required to Submit"}
                  </span>
                </div>

                <p
                  id="certification-description"
                  className={cn(
                    "text-xs leading-relaxed transition-colors",
                    confirmed ? "text-emerald-900/90" : "text-slate-700"
                  )}
                >
                  {t("apply.review.certify")}
                </p>
              </div>
            </label>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <Link
                href={listing ? "/apply/documents" : "/apply/schedule"}
                className={buttonStyles({
                  variant: "outline",
                  size: "lg",
                  className: "justify-center shrink-0 font-bold text-sm h-12 px-6",
                })}
              >
                {t("common.back")}
              </Link>
              <Button
                size="lg"
                disabled={!ready || !confirmed}
                loading={submit.isPending}
                loadingLabel={t("apply.review.submitting")}
                onClick={() => {
                  submit.mutate(undefined, {
                    onSuccess: () => {
                      setShowSuccessModal(true);
                    },
                  });
                }}
                className="font-bold gap-2 text-sm sm:text-base shadow-md flex-1 whitespace-normal text-center"
              >
                <Send className="h-4 w-4 shrink-0" />
                <span>{t("apply.review.submit")}</span>
              </Button>
            </div>

            <p className="text-xs text-center text-text-muted">
              {ready
                ? t("apply.review.approvalNote")
                : t("apply.review.completeRemaining", { count: outstanding.length })}
            </p>
          </div>
        </div>
      ) : null}

      <RegistrationSuccessModal
        open={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          router.push("/apply");
        }}
        application={application}
      />
    </section>
  );
}
