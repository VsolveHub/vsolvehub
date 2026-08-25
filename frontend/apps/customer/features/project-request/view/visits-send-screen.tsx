"use client";

import type { ReactNode } from "react";
import { MapPin, Calendar, CheckCircle2, Clock } from "lucide-react";
import { ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * Step 3 of 3 — Choose visits & send.
 *
 * Contains:
 * - Compact read-only service facts
 * - Compact read-only site/date facts
 * - 1/2/3 estimate selector
 * - Isolated slot container ready for generated backend slot contract
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

export function VisitsSendScreen({
  serviceName,
  questions,
  answers,
  addressLine,
  requestedStart,
  flexibilityDays,
  serviceBy,
  visitPlanChooser,
}: VisitsSendScreenProps) {
  const answeredFacts: { label: string; value: string }[] = [];
  for (const q of questions) {
    const val = answers[q.code];
    if (val !== undefined && val !== null && val !== "") {
      let displayValue = String(val);
      if (q.kind === "boolean") {
        displayValue = val === true ? "Yes" : "No";
      } else if (q.kind === "choice" && q.options) {
        const matched = q.options.find((opt) => opt.value === val);
        if (matched) displayValue = matched.label;
      }
      answeredFacts.push({ label: q.label, value: displayValue });
    }
  }

  const formattedStart = formatDay(requestedStart);
  const formattedDeadline = formatDay(serviceBy);

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeading title="Choose visits & send" />

      {/* Service Facts Recap */}
      <section className="rounded-card border border-line bg-surface p-4">
        <div className="flex items-center gap-2 border-b border-line pb-2 mb-3">
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
        ) : (
          <p className="text-xs text-text-muted">Standard requirement details</p>
        )}
      </section>

      {/* Site & Date Facts Recap */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Location & Schedule</h3>
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <MapPin className="h-4 w-4 text-text-muted shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-text-muted">Site address</span>
              <span className="block font-semibold text-text truncate">
                {addressLine ?? "No address selected"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Calendar className="h-4 w-4 text-text-muted shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-text-muted">Start date</span>
              <span className="block font-semibold text-text">
                {formattedStart ?? "Not specified"}{" "}
                {flexibilityDays > 0 ? `(± ${flexibilityDays} days)` : "(Exact date)"}
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

      {/* 1/2/3 Estimate Selector */}
      {visitPlanChooser}

      {/* Slot Selection Container (Isolated and ready for generated contract) */}
      <div data-visit-slots-container className="hidden">
        {/* Will mount candidate visit windows when signed-slot contract is published by Codex */}
      </div>
    </div>
  );
}
