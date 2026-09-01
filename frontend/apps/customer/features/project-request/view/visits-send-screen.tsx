"use client";

import type { ReactNode } from "react";
import { Calendar, CheckCircle2, Clock, MapPin, PackageCheck } from "lucide-react";
import { ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * Step 3 of 3 — Choose visits & send.
 *
 * Contains:
 * - Compact read-only service facts, as the catalogue's labels (never codes)
 * - Compact read-only site/date facts
 * - 1/2/3 estimate selector
 * - One Customer-owned time per requested estimate
 * - Direct submission path
 */

export interface VisitsSendScreenProps {
  serviceName: string;
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  addressLine: string | null;
  requestedStart: string | null;
  flexibilityDays: number;
  serviceBy: string | null;
  visitPlanChooser?: ReactNode;
  visitSlotChooser?: ReactNode;
  /** Event-shaped brief: the date is the event date and has no flexibility. */
  eventMode?: boolean;
  /** Visit-first (A5) brief: the date is the visit date, never "± n days". */
  visitFirst?: boolean;
}

const DAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return DAY_FORMATTER.format(new Date(year, month - 1, day));
}

/** An answer as the words the Customer tapped, or null when it says nothing. */
export function answerLabel(question: RequirementQuestionView, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (question.kind === "boolean") return value === true ? "Yes" : "No";
  const options = question.options ?? [];
  if (question.kind === "multi") {
    if (!Array.isArray(value) || value.length === 0) return null;
    return value
      .map((entry) => options.find((option) => option.value === entry)?.label ?? String(entry))
      .join(" + ");
  }
  if (question.kind === "choice") {
    return options.find((option) => option.value === value)?.label ?? String(value);
  }
  return String(value);
}

export function VisitsSendScreen({
  serviceName,
  questions,
  answers,
  addressLine,
  requestedStart,
  flexibilityDays,
  serviceBy,
  visitPlanChooser,
  visitSlotChooser,
  eventMode = false,
  visitFirst = false,
}: VisitsSendScreenProps) {
  const answeredFacts: { label: string; value: string }[] = [];
  for (const question of questions) {
    const label = answerLabel(question, answers[question.code]);
    if (label !== null) answeredFacts.push({ label: question.label, value: label });
  }

  const formattedStart = formatDay(requestedStart);
  const formattedDeadline = formatDay(serviceBy);
  const singleDate = eventMode || visitFirst;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeading title="Choose visits & send" />

      {/* Service Facts Recap. With no answers — a visit-first brief that asked
          nothing — the card is the service name alone: no empty list, no
          divider under a heading with nothing beneath it. */}
      <section className="rounded-card border border-line bg-surface p-4">
        <div
          className={
            answeredFacts.length > 0
              ? "flex items-center gap-2 border-b border-line pb-2 mb-3"
              : "flex items-center gap-2"
          }
        >
          <CheckCircle2 className="h-4 w-4 text-action-secondary shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-text">{serviceName}</h3>
        </div>
        {answeredFacts.length > 0 ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
            {answeredFacts.map((fact) => (
              <div key={fact.label} className="flex justify-between gap-2 py-0.5 border-b border-line-subtle last:border-0">
                <dt className="text-text-muted font-medium">{fact.label}</dt>
                <dd className="text-text font-semibold text-right">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* Site & Date Facts Recap */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
          {eventMode ? "Venue & date" : "Location & Schedule"}
        </h3>
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <MapPin className="h-4 w-4 text-text-muted shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-text-muted">
                {eventMode ? "Venue" : "Site address"}
              </span>
              <span className="block font-semibold text-text truncate">
                {addressLine ?? "No address selected"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Calendar className="h-4 w-4 text-text-muted shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-text-muted">
                {eventMode ? "Event date" : visitFirst ? "Pro comes from" : "Start date"}
              </span>
              <span className="block font-semibold text-text">
                {formattedStart ?? "Not specified"}
                {singleDate
                  ? null
                  : ` ${flexibilityDays > 0 ? `(± ${flexibilityDays} days)` : "(Exact date)"}`}
              </span>
            </div>
          </div>

          {formattedDeadline ? (
            <div className="flex items-start gap-2.5">
              <Clock className="h-4 w-4 text-text-muted shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-text-muted">Must finish by</span>
                <span className="block font-semibold text-text">{formattedDeadline}</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {eventMode ? (
        <section className="flex gap-3 rounded-card border border-success-line bg-success-surface p-4 text-success-text">
          <PackageCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <h3 className="text-sm font-bold text-text">Your decorator handles the materials</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              After the visit, each decorator sends one complete supply-and-install estimate. You see every item and finish, but you do not need to shop for décor materials.
            </p>
          </div>
        </section>
      ) : null}

      {/* 1/2/3 Estimate Selector */}
      {visitPlanChooser}

      {/* One Customer-owned time for every requested estimate. */}
      {visitSlotChooser}
    </div>
  );
}
