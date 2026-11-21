"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, cn, useT } from "@vsolve/ui";
import { Check, Clock } from "lucide-react";

import { applicationStatusPresentation, trackerStage, type Tone } from "../model/status";

/**
 * Where the application is, on one card: the status, a four-stop tracker, and what happens next.
 *
 * Replaces a status banner, a progress hero, a "submitted" hero and a desktop guide box that each
 * restated the same status in their own words. The reviewer's message appears here and only
 * here, verbatim — a generic "something needs attention" sends people to fix the wrong thing.
 *
 * Same layout as the phone app's card (`frontend/mobile/apps/partner/.../status-banner.tsx`):
 * a strip in the status colour along the top, the stops joined by a line that fills as the
 * application moves on, and what happens next in a quiet footer.
 */

type Application = Schemas["PartnerApplication"];

const STOPS = [
  "apply.tracker.fill",
  "apply.tracker.sent",
  "apply.tracker.review",
  "apply.tracker.decision",
] as const;

/** The top strip, in the badge's own colour, so the state reads before any word does. */
export const STATUS_ACCENT: Record<Tone, string> = {
  neutral: "bg-line-strong",
  info: "bg-info-text",
  success: "bg-success-text",
  warning: "bg-warning-text",
  danger: "bg-danger-text",
};

const SUBMITTED_AT = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function ApplicationStatusTracker({ application }: { application: Application }) {
  const t = useT();
  const isAreaPending =
    (application.service_area_ids?.length ?? 0) === 0 &&
    ((application.requested_postal_codes?.length ?? 0) > 0 ||
      (application.area_requests ?? []).some((r) => r.status !== "NOT_VALID"));
  const presentation = applicationStatusPresentation(application.status, { isAreaPending });
  const stage = trackerStage(application.status);
  const isWaiting = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";

  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-card border border-line bg-surface shadow-xs"
    >
      <div aria-hidden className={cn("h-1", STATUS_ACCENT[presentation.tone])} />

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <Badge tone={presentation.tone} dot className="self-start">
            {t(presentation.labelKey)}
          </Badge>
          <h1 className="text-xl font-extrabold tracking-tight text-text sm:text-2xl">
            {t(presentation.headlineKey)}
          </h1>
        </div>

        <ol className="grid list-none grid-cols-4 p-0" aria-label={t("apply.tracker.label")}>
          {STOPS.map((key, index) => {
            const isDone = index < stage;
            const isCurrent = index === stage;
            return (
              <li key={key} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <span className="relative flex h-6 w-full items-center justify-center">
                  {index > 0 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 right-1/2 h-0.5",
                        index <= stage ? "bg-success-text" : "bg-line",
                      )}
                    />
                  ) : null}
                  {index < STOPS.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn("absolute left-1/2 right-0 h-0.5", index < stage ? "bg-success-text" : "bg-line")}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "relative grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold",
                      isDone && "bg-success-text text-surface",
                      isCurrent && "bg-action text-action-text",
                      !isDone && !isCurrent && "border-2 border-line-strong bg-surface text-text-muted",
                    )}
                  >
                    {isDone ? <Check size={13} strokeWidth={3} /> : index + 1}
                  </span>
                </span>
                <span
                  className={cn(
                    "break-words text-[11px] leading-tight sm:text-xs",
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

        {isAreaPending && (application.requested_postal_codes?.length ?? 0) > 0 ? (
          <div className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text-secondary">
            <p className="font-semibold text-text">{t("apply.statusBanner.requestedPinsTitle")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {application.requested_postal_codes?.map((pin) => (
                <span
                  key={pin}
                  className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs"
                >
                  {pin}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2.5 border-t border-line bg-surface-sunken/60 px-4 py-3.5 sm:px-5">
        <Clock size={16} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-text-secondary">{t(presentation.nextKey)}</p>
          {isWaiting && application.submitted_at ? (
            <p className="text-xs text-text-muted">
              {t("apply.statusBanner.submittedOn", {
                date: SUBMITTED_AT.format(new Date(application.submitted_at)),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
