"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, cn, useT } from "@vsolve/ui";
import { Check } from "lucide-react";

import { applicationStatusPresentation, trackerStage } from "../model/status";

/**
 * Where the application is, on one card: the status, a four-stop tracker, and what happens next.
 *
 * Replaces a status banner, a progress hero, a "submitted" hero and a desktop guide box that each
 * restated the same status in their own words. The reviewer's message appears here and only
 * here, verbatim — a generic "something needs attention" sends people to fix the wrong thing.
 */

type Application = Schemas["PartnerApplication"];

const STOPS = [
  "apply.tracker.fill",
  "apply.tracker.sent",
  "apply.tracker.review",
  "apply.tracker.decision",
] as const;

export function ApplicationStatusTracker({ application }: { application: Application }) {
  const t = useT();
  const presentation = applicationStatusPresentation(application.status);
  const stage = trackerStage(application.status);
  const isWaiting = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-3.5 shadow-xs sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <Badge tone={presentation.tone} className="self-start">
          {t(presentation.labelKey)}
        </Badge>
        <h1 className="text-xl font-extrabold tracking-tight text-text">{t(presentation.headlineKey)}</h1>
      </div>

      <ol className="grid list-none grid-cols-4 gap-1 p-0" aria-label={t("apply.tracker.label")}>
        {STOPS.map((key, index) => {
          const isDone = index < stage;
          const isCurrent = index === stage;
          return (
            <li key={key} className="flex flex-col items-center gap-1.5 text-center min-w-0">
              <span
                aria-hidden
                className={cn(
                  "grid h-6 w-6 sm:h-7 sm:w-7 place-items-center rounded-full border-2 text-[10px] sm:text-xs font-bold shrink-0",
                  isDone && "border-success-text bg-success-text text-surface",
                  isCurrent && "border-action bg-action text-action-text",
                  !isDone && !isCurrent && "border-line-strong text-text-muted",
                )}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[10px] sm:text-xs break-words leading-tight",
                  isCurrent ? "font-bold text-text" : "text-text-secondary",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {t(key)}
              </span>
            </li>
          );
        })}
      </ol>

      {application.status === "CHANGES_REQUIRED" ? (
        <p className="rounded-control border border-warning-line bg-warning-surface p-3 text-sm text-text">
          {application.change_request_message || t("apply.statusBanner.changesRequired.fallbackDetail")}
        </p>
      ) : null}

      <p className="text-sm text-text-secondary">{t(presentation.nextKey)}</p>

      {isWaiting && application.submitted_at ? (
        <p className="text-xs text-text-muted">
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
