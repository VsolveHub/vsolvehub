"use client";

import type { Schemas } from "@vsolve/api-client";
import { cn, useT, type Translator } from "@vsolve/ui";

/**
 * The application's current standing, stated plainly.
 *
 * Onboarding is where a Partner is most likely to be confused and least likely
 * to ask, so each state says three things: where the application is, whether the
 * Partner needs to do anything, and — when they are waiting — that waiting is
 * correct.
 *
 * `CHANGES_REQUIRED` carries the reviewer's own message. It is rendered verbatim
 * rather than summarised: a generic "some documents need attention" is exactly
 * the copy that sends someone back to re-upload the wrong thing.
 *
 * `SUSPENDED` and `OFFBOARDED` deliberately do not explain themselves here.
 * Those decisions have appeal paths that run through support, and a banner is
 * the wrong surface for a dispute.
 */

type Application = Schemas["PartnerApplication"];
type Status = Schemas["PartnerApplicationStatusEnum"];

interface Presentation {
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  label: string;
  headline: string;
  detail: string;
  /** True when the Partner is waiting on someone else and should not act. */
  isWaiting: boolean;
}

function presentationFor(status: Status, t: Translator["t"]): Presentation {
  switch (status) {
    case "DRAFT":
      return {
        tone: "neutral",
        label: t("apply.statusBanner.draft.label"),
        headline: t("apply.statusBanner.draft.headline"),
        detail: t("apply.statusBanner.draft.detail"),
        isWaiting: false,
      };
    case "SUBMITTED":
      return {
        tone: "info",
        label: t("apply.statusBanner.submitted.label"),
        headline: t("apply.statusBanner.submitted.headline"),
        detail: t("apply.statusBanner.submitted.detail"),
        isWaiting: true,
      };
    case "UNDER_REVIEW":
      return {
        tone: "info",
        label: t("apply.statusBanner.underReview.label"),
        headline: t("apply.statusBanner.underReview.headline"),
        detail: t("apply.statusBanner.underReview.detail"),
        isWaiting: true,
      };
    case "CHANGES_REQUIRED":
      return {
        tone: "warning",
        label: t("apply.statusBanner.changesRequired.label"),
        headline: t("apply.statusBanner.changesRequired.headline"),
        detail: "",
        isWaiting: false,
      };
    case "APPROVED":
      return {
        tone: "success",
        label: t("apply.statusBanner.approved.label"),
        headline: t("apply.statusBanner.approved.headline"),
        detail: t("apply.statusBanner.approved.detail"),
        isWaiting: false,
      };
    case "SUSPENDED":
      return {
        tone: "danger",
        label: t("apply.statusBanner.suspended.label"),
        headline: t("apply.statusBanner.suspended.headline"),
        detail: t("apply.statusBanner.suspended.detail"),
        isWaiting: false,
      };
    case "OFFBOARDED":
      return {
        tone: "neutral",
        label: t("apply.statusBanner.offboarded.label"),
        headline: t("apply.statusBanner.offboarded.headline"),
        detail: t("apply.statusBanner.offboarded.detail"),
        isWaiting: false,
      };
    case "DECLINED":
      return {
        tone: "neutral",
        label: t("apply.statusBanner.declined.label"),
        headline: t("apply.statusBanner.declined.headline"),
        detail: t("apply.statusBanner.declined.detail"),
        isWaiting: false,
      };
  }
}

export interface ApplicationStatusBannerProps {
  application: Application;
}

export function ApplicationStatusBanner({ application }: ApplicationStatusBannerProps) {
  const t = useT();
  // When in DRAFT, the NextAction hero card handles the primary progress guidance directly.
  if (application.status === "DRAFT") return null;

  const presentation = presentationFor(application.status, t);

  const detail =
    application.status === "CHANGES_REQUIRED"
      ? application.change_request_message || t("apply.statusBanner.changesRequired.fallbackDetail")
      : presentation.detail;

  return (
    <section
      aria-live={presentation.isWaiting ? "polite" : "assertive"}
      className={cn(
        "rounded-2xl border p-5 shadow-xs transition-all",
        presentation.tone === "info" && "bg-sky-50 border-sky-200 text-sky-950",
        presentation.tone === "warning" && "bg-amber-50 border-amber-300 text-amber-950",
        presentation.tone === "success" && "bg-emerald-50 border-emerald-300 text-emerald-950",
        presentation.tone === "danger" && "bg-rose-50 border-rose-300 text-rose-950",
        presentation.tone === "neutral" && "bg-surface-sunken border-line text-text",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wider",
            presentation.tone === "info" && "bg-sky-600 text-white",
            presentation.tone === "warning" && "bg-amber-600 text-white",
            presentation.tone === "success" && "bg-emerald-600 text-white",
            presentation.tone === "danger" && "bg-rose-600 text-white",
            presentation.tone === "neutral" && "bg-navy-900 text-white",
          )}
        >
          {presentation.label}
        </span>
        <h2 className="text-base font-bold text-navy-900">{presentation.headline}</h2>
      </div>

      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{detail}</p>

      {application.submitted_at && presentation.isWaiting ? (
        <p className="mt-3 text-xs text-text-muted font-medium border-t border-line/40 pt-2">
          {t("apply.statusBanner.submittedOn", {
            date: new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(application.submitted_at)),
          })}
        </p>
      ) : null}
    </section>
  );
}
