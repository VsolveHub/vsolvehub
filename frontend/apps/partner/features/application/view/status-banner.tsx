"use client";

import type { Schemas } from "@vsolve/api-client";
import { cn } from "@vsolve/ui";

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

const PRESENTATION: Record<Status, Presentation> = {
  DRAFT: {
    tone: "neutral",
    label: "Draft",
    headline: "Your application is not submitted yet",
    detail: "Finish the steps below and send it for review. You can come back any time.",
    isWaiting: false,
  },
  SUBMITTED: {
    tone: "info",
    label: "Submitted",
    headline: "We have your application",
    detail:
      "Nothing more is needed from you right now. We will message you when a reviewer has looked at it.",
    isWaiting: true,
  },
  UNDER_REVIEW: {
    tone: "info",
    label: "Under review",
    headline: "A reviewer is checking your documents",
    detail:
      "Nothing more is needed from you right now. If anything is unclear, we will ask you directly.",
    isWaiting: true,
  },
  CHANGES_REQUIRED: {
    tone: "warning",
    label: "Changes needed",
    headline: "We need something corrected",
    detail: "",
    isWaiting: false,
  },
  APPROVED: {
    tone: "success",
    label: "Approved",
    headline: "You are approved to take work",
    detail: "Publish the hours you want to work and you will start receiving job offers.",
    isWaiting: false,
  },
  SUSPENDED: {
    tone: "danger",
    label: "Suspended",
    headline: "Your account is suspended",
    detail: "You will not receive job offers. Contact support to discuss this.",
    isWaiting: false,
  },
  OFFBOARDED: {
    tone: "neutral",
    label: "Closed",
    headline: "Your Partner account is closed",
    detail: "Contact support if you believe this is wrong.",
    isWaiting: false,
  },
};

export interface ApplicationStatusBannerProps {
  application: Application;
}

export function ApplicationStatusBanner({ application }: ApplicationStatusBannerProps) {
  // When in DRAFT, the NextAction hero card handles the primary progress guidance directly.
  if (application.status === "DRAFT") return null;

  const presentation = PRESENTATION[application.status];

  const detail =
    application.status === "CHANGES_REQUIRED"
      ? application.change_request_message ||
        "A reviewer asked for changes but did not leave a note. Contact support and we will tell you what is needed."
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
          Submitted on{" "}
          <time dateTime={application.submitted_at} className="font-bold text-navy-900">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(application.submitted_at))}
          </time>
        </p>
      ) : null}
    </section>
  );
}
