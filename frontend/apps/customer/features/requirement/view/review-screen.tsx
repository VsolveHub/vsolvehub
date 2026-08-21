"use client";

import { Button, ErrorState, cn } from "@vsolve/ui";
import { useState, type ReactNode } from "react";

import { guideToVisitPlanSelection } from "@/features/access/view/guide-to-visit-plan";

import { OPTIONAL_DETAILS, OPTIONAL_DETAIL_LABELS, type Screen } from "../model/screens";
import type { DraftAttachment } from "../model/state";
import { BLOCK_COPY } from "./block-copy";
import { OptionalDetailPanel, summariseOptionalDetail } from "./optional-detail-panels";
import { useRequirement } from "./requirement-context";

/** Review is the confirmation: no second approval screen follows this one. */

function attachmentSummary(attachments: readonly DraftAttachment[]): string {
  if (attachments.length === 0) return "No files added";

  const attached = attachments.filter((item) => item.state === "attached").length;
  const checking = attachments.filter((item) => item.state === "scanning").length;
  const notAttached = attachments.filter(
    (item) => item.state === "failed" || item.state === "queued" || item.state === "uploading",
  ).length;

  const parts = [attached === 1 ? "1 file ready" : `${attached} files ready`];
  if (checking > 0) parts.push(`${checking} being checked`);
  if (notAttached > 0) parts.push(`${notAttached} not attached`);
  return parts.join(" · ");
}

export interface ReviewScreenProps {
  categoryName: string;
  addressLines: readonly string[] | null;
  isFree: boolean | null;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  submitLabel?: string;
  visitPlanChooser?: ReactNode;
  submitBlockedReason?: string | null;
  requiresVisitPlanSelection?: boolean;
  isChoosingVisitPlan?: boolean;
}

export function ReviewScreen({
  categoryName,
  addressLines,
  isFree,
  onSubmit,
  isSubmitting,
  submitError,
  submitLabel = "Send this request",
  visitPlanChooser,
  submitBlockedReason = null,
  requiresVisitPlanSelection = false,
  isChoosingVisitPlan = false,
}: ReviewScreenProps) {
  const { state, open, blocked } = useRequirement();
  const [openExtra, setOpenExtra] = useState<string | null>(null);
  const summaryItems: readonly SummaryItem[] = [
    {
      label: "Work",
      value: categoryName,
      detail: "Project brief",
      screen: "what",
      icon: "work",
    },
    {
      label: "Place",
      value: addressLines?.join(", ") ?? "Location saved",
      detail: "Where professionals will visit",
      screen: "where_when",
      icon: "place",
    },
    {
      label: "When",
      value: formatRequestDate(state.requestedStart),
      detail:
        state.flexibilityDays > 0
          ? `${state.flexibilityDays} day${state.flexibilityDays === 1 ? "" : "s"} flexible`
          : "Fixed start date",
      screen: "where_when",
      icon: "calendar",
    },
    {
      label: "Proof",
      value: attachmentSummary(state.attachments),
      detail: "Photos, files and voice notes",
      screen: "details",
      icon: "attachment",
    },
  ];

  return (
    <div>
      <header className="rounded-card border border-navy-700 bg-navy-900 px-5 py-5 text-white shadow-card sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-navy-100">
              <span
                className={cn(
                  "size-2 rounded-full",
                  blocked === null ? "bg-success-text" : "bg-warning-text",
                )}
                aria-hidden
              />
              {blocked === null ? "Brief ready" : "Brief needs a check"}
            </div>
            <h2 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">
              Ready to find your fit-out team
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-navy-100">
              Check the project facts, choose your site visits, then send.
            </p>
          </div>
          <ReviewRoute />
        </div>
      </header>

      {state.verdict !== null ? (
        <div className="mt-4 flex items-start gap-3 rounded-card border border-info-line bg-info-surface px-4 py-3">
          <ReviewIcon kind="shield" className="mt-0.5 size-5 shrink-0 text-info-text" />
          <p className="text-sm font-medium leading-6 text-text">{state.verdict.explanation}</p>
        </div>
      ) : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="brief-summary-heading" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-bold uppercase text-text-muted">Review</p>
                <h3 id="brief-summary-heading" className="mt-0.5 text-lg font-extrabold text-text">
                  Your project brief
                </h3>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  blocked === null
                    ? "bg-success-surface text-success-text"
                    : "bg-warning-surface text-warning-text",
                )}
              >
                {blocked === null ? "4 parts ready" : "Check required"}
              </span>
            </div>

            <div className="grid sm:grid-cols-2">
              {summaryItems.map((item) => (
                <SummaryButton key={item.label} item={item} onEdit={() => open(item.screen)} />
              ))}
            </div>

            {state.additionalDetails ? (
              <details className="group border-t border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold text-text transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                  Notes you added
                  <span className="ml-auto text-xs font-semibold text-text-muted">Open</span>
                  <DownChevron />
                </summary>
                <p className="whitespace-pre-line border-t border-line bg-canvas px-4 py-4 text-sm leading-6 text-text-secondary sm:px-5">
                  {state.additionalDetails}
                </p>
              </details>
            ) : null}
          </section>

          <section aria-labelledby="extras-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-text-muted">Optional</p>
                <h3 id="extras-heading" className="mt-0.5 text-lg font-extrabold text-text">
                  Access and contact preferences
                </h3>
              </div>
              <span className="hidden text-xs font-semibold text-text-muted sm:block">
                Add only what applies
              </span>
            </div>
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {OPTIONAL_DETAILS.map((key) => {
                const summary = summariseOptionalDetail(state.optionalDetails, key);
                const buttonId = `extra-${key}`;
                const expanded = openExtra === key;

                return (
                  <li key={key} className="overflow-hidden rounded-card border border-line bg-surface">
                    <button
                      id={buttonId}
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={expanded ? `${buttonId}-panel` : undefined}
                      onClick={() => setOpenExtra(expanded ? null : key)}
                      className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active">
                        <ReviewIcon kind="settings" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-text">
                          {OPTIONAL_DETAIL_LABELS[key]}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-text-secondary">
                          {summary ?? "Not added"}
                        </span>
                      </span>
                      <DownChevron />
                    </button>

                    {expanded ? (
                      <div id={`${buttonId}-panel`} className="border-t border-line bg-canvas">
                        <OptionalDetailPanel detail={key} labelledBy={buttonId} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
          {visitPlanChooser}

          {submitError !== null ? (
            <ErrorState title="We could not send this" message={submitError} inline />
          ) : null}

          <section className="rounded-card bg-navy-900 p-5 text-white shadow-card">
            <p className="text-xs font-bold uppercase text-navy-200">Final step</p>
            <h3 className="mt-1 text-xl font-extrabold">Start matching</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-navy-100">
              Professionals receive this brief after you send it. Nothing is booked yet.
            </p>
            <Button
              block
              variant="secondary"
              className="mt-4"
              onClick={
                requiresVisitPlanSelection ? guideToVisitPlanSelection : onSubmit
              }
              loading={isSubmitting || isChoosingVisitPlan}
              loadingLabel={
                isChoosingVisitPlan ? "Saving your estimate choice" : "Sending your request"
              }
              disabled={
                blocked !== null ||
                (submitBlockedReason !== null && !requiresVisitPlanSelection)
              }
            >
              {requiresVisitPlanSelection ? "Select number of estimates" : submitLabel}
            </Button>

            {blocked !== null ? (
              <p role="status" className="mt-3 text-sm leading-5 text-navy-100">
                {BLOCK_COPY[blocked]}
              </p>
            ) : submitBlockedReason !== null ? (
              <p role="status" className="mt-3 text-sm leading-5 text-navy-100">
                {submitBlockedReason}
              </p>
            ) : isFree === true ? (
              <p className="mt-3 text-sm font-semibold text-navy-100">
                Free to send. Nothing is charged now.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
  screen: Screen;
  icon: ReviewIconKind;
}

function SummaryButton({ item, onEdit }: { item: SummaryItem; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${item.label.toLowerCase()}`}
      className="group flex min-h-28 cursor-pointer items-start gap-3 border-b border-line px-4 py-4 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring odd:sm:border-r sm:px-5"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-action-surface text-action-active">
        <ReviewIcon kind={item.icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase text-text-muted">{item.label}</span>
        <span className="mt-1 block break-words text-sm font-extrabold leading-5 text-text">
          {item.value}
        </span>
        <span className="mt-1 block text-xs font-medium text-text-secondary">{item.detail}</span>
      </span>
      <span aria-hidden className="mt-1 text-text-muted transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:transform-none">
        <ReviewIcon kind="edit" className="size-4" />
      </span>
    </button>
  );
}

function ReviewRoute() {
  const steps = [
    ["brief", "Brief ready"],
    ["visit", "Site visits"],
    ["quote", "Written quotes"],
  ] as const;

  return (
    <ol className="grid w-full max-w-sm grid-cols-3" aria-label="What happens after sending">
      {steps.map(([icon, label], index) => (
        <li key={label} className="relative flex min-w-0 flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-navy-600 first:before:left-1/2 last:before:right-1/2">
          <span aria-hidden className={cn("relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-navy-900", index === 0 ? "bg-white text-navy-900" : "bg-navy-700 text-navy-100")}>
            <ReviewIcon kind={icon} className="size-4" />
          </span>
          <span className="mt-2 text-xs font-bold leading-4 text-white">{label}</span>
        </li>
      ))}
    </ol>
  );
}

type ReviewIconKind =
  | "work"
  | "place"
  | "calendar"
  | "attachment"
  | "shield"
  | "settings"
  | "edit"
  | "brief"
  | "visit"
  | "quote";

function ReviewIcon({ kind, className }: { kind: ReviewIconKind; className?: string }) {
  const path = {
    work: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9 0h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 5h14",
    place: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    calendar: "M6 3v3m12-3v3M4 8h16v12H4V8Zm0-3h16v3H4V5Zm4 7h3v3H8v-3Z",
    attachment: "m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",
    shield: "M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
    edit: "m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-13 3 3",
    brief: "M7 3h7l4 4v14H7V3Zm7 0v5h5M10 13h5m-5 4h5",
    visit: "M4 18h16M7 18v-5l5-4 5 4v5M9 8V5h6v3",
    quote: "M5 5h14v11H9l-4 4V5Zm4 4h6m-6 3h4",
  }[kind];

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

function DownChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-text-muted transition-transform duration-fast group-open:rotate-180">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatRequestDate(value: string | null): string {
  if (value === null) return "No start date";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
