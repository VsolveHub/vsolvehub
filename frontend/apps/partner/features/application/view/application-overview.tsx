"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton, cn } from "@vsolve/ui";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { canSubmit, isEditable, rejectedDocuments } from "../model/readiness";
import { usePartnerApplication } from "../queries";
import { ApplicationStatusBanner } from "./status-banner";

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
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading your application" className="flex flex-col gap-4">
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
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
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
 * short one: what it costs, what it does not commit you to, and one button.
 */
function NotStarted() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-5 py-7 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface/15 text-surface">
          <Sparkles size={26} aria-hidden />
        </span>
        <h1 className="text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-surface">
          Start your application
        </h1>
        <p className="max-w-[32ch] text-[0.9375rem] leading-relaxed text-navy-200">
          About five minutes. You can stop and come back — nothing is sent for
          review until you choose to send it.
        </p>
      </div>

      <ul className="flex list-none flex-col gap-2 p-0">
        <Promise>You choose which areas you travel to</Promise>
        <Promise>You choose the hours you work</Promise>
        <Promise>Nothing is shared with customers until you are approved</Promise>
      </ul>

      <Link
        href="/apply/about"
        className="flex h-13 items-center justify-center gap-2 rounded-control bg-action px-7 text-[1.0625rem] font-bold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Begin
        <ArrowRight size={19} aria-hidden />
      </Link>
    </section>
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
  const steps = stepProgress(application);
  const summary = progressSummary(application);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="sr-only">Your application</h1>

      <ApplicationStatusBanner application={application} />

      {/*
        Rejected documents come first and stay outside the step list.

        They are not the same as a missing document: the applicant did upload
        something, a reviewer looked at it and said no, and the reviewer's reason
        is the single most useful string on this screen. Folding them into "2
        things needed" would lose the reason and tell somebody to do again
        exactly what they already did.
      */}
      {rejected.length > 0 ? (
        <div role="alert" className="rounded-card border border-warning-line bg-warning-surface p-4">
          <h2 className="text-[0.9375rem] font-bold text-warning-text">
            Replace {rejected.length === 1 ? "this document" : "these documents"}
          </h2>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {rejected.map((document) => (
              <li key={document.id}>
                <p className="text-[0.875rem] font-semibold text-warning-text">
                  {DOCUMENT_LABELS[document.kind]}
                </p>
                {/* The reviewer's reason, verbatim. Summarising it is how a
                    Partner re-uploads the same unusable photo three times. */}
                {document.review_reason ? (
                  <p className="text-[0.875rem] leading-relaxed text-warning-text/85">
                    {document.review_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href="/apply/documents"
            className="mt-3 inline-flex h-11 items-center rounded-control bg-warning-text px-4 text-[0.875rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Upload replacements
          </Link>
        </div>
      ) : null}

      {editable ? <NextAction summary={summary} ready={ready} /> : null}

      <StepList steps={steps} editable={editable} />

      {/*
        The entry point to the M2 registration surface.

        A quiet card rather than a step in the sequence: workforce and project
        approval is asked for when a Partner wants it, and putting it on the path
        would tell every applicant they have another thing to finish. The screen
        behind it shows an honest empty state when none of their services is open
        to it, so the link never leads to a promise.
      */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-[0.9375rem] font-bold text-text">Specialist work</h2>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-text-secondary">
          Supplying a crew by the day, or quoting for a whole project, is reviewed
          separately from ordinary jobs. Asking costs nothing and does not affect
          the work you already do.
        </p>
        <Link
          href="/apply/capabilities"
          className="mt-3 inline-flex h-11 items-center rounded-control border border-line-strong px-4 text-[0.875rem] font-bold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          See what you can apply for
        </Link>
      </section>

      {application.status === "APPROVED" ? <Approved /> : null}

      <History transitions={application.transitions} />
    </section>
  );
}

/**
 * The hero: how far through, and the single next thing.
 *
 * Names the step rather than saying "Continue". An applicant who left three
 * days ago has no memory of where they stopped, and the whole value of a
 * resume button is that they do not have to.
 */
function NextAction({
  summary,
  ready,
}: {
  summary: ReturnType<typeof progressSummary>;
  ready: boolean;
}) {
  const percent = Math.round(summary.fraction * 100);

  return (
    <div className="flex flex-col gap-4 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
            Your application
          </p>
          <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-[-0.03em] text-surface">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{summary.done}</span>
            <span className="text-navy-200"> / {summary.total}</span>
          </p>
        </div>
        <p className="pb-1 text-[0.8125rem] font-semibold text-navy-200">
          {ready ? "Ready to send" : `${summary.total - summary.done} to go`}
        </p>
      </div>

      <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface/15">
        <span
          className="block h-full rounded-full bg-action transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </span>

      <Link
        href={ready ? "/apply/review" : (summary.nextIncomplete?.href ?? "/apply/review")}
        className="flex h-13 items-center justify-center gap-2 rounded-control bg-action px-6 text-[1.0625rem] font-bold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
      >
        {ready ? "Review and send" : `Next: ${summary.nextIncomplete?.label.toLowerCase() ?? "review"}`}
        <ArrowRight size={19} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Every step with its state, as rows.
 *
 * Completed steps stay in the list rather than disappearing. Onboarding is long
 * enough that seeing what is behind you matters, and a list that shrinks as you
 * work gives no sense of the whole.
 */
function StepList({ steps, editable }: { steps: readonly StepProgress[]; editable: boolean }) {
  const rows = steps.filter((step) => step.state !== "waypoint");

  return (
    <section>
      <h2 className="pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        Every step
      </h2>
      <ul className="flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
        {rows.map((step, index) => (
          <li key={step.href} className={index === rows.length - 1 ? "" : "border-b border-line"}>
            <Link
              href={step.href}
              className={cn(
                "flex min-h-15 items-center gap-3 px-3.5 py-2.5 hover:bg-surface-hover",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
              )}
            >
              <StateMark state={step.state} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.9375rem] font-bold text-text">{step.label}</span>
                <span className="truncate text-[0.8125rem] text-text-secondary">
                  {step.state === "done"
                    ? "Done"
                    : step.state === "optional"
                      ? "Optional"
                      : step.outstanding === 1
                        ? "1 thing needed"
                        : `${step.outstanding} things needed`}
                </span>
              </span>
              {editable ? (
                <ArrowRight size={17} className="shrink-0 text-text-muted" aria-hidden />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-surface text-success-text">
        <Check size={17} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "todo") {
    return (
      <span aria-hidden className="h-8 w-8 shrink-0 rounded-full border-2 border-action" />
    );
  }
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-line-strong text-text-muted"
    >
      <span className="h-0.5 w-3 rounded-full bg-current" />
    </span>
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
function Approved() {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
      <p className="text-[0.9375rem] font-bold text-success-text">You are approved</p>
      <p className="text-[0.875rem] leading-relaxed text-success-text/85">
        Go on duty and jobs near you will start coming through.
      </p>
      {/* `/home` directly: `/dashboard` and `/work` both redirect there, and the
          duty control lives on it. `/availability` — which this used to point
          at — is a redirect to `/me`, and `/me` is a settings hub rather than
          the screen a newly-approved Partner wants first. */}
      <Link
        href="/home"
        className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Go to your work
        <ArrowRight size={18} aria-hidden />
      </Link>
    </div>
  );
}

const DOCUMENT_LABELS: Record<Schemas["PartnerDocumentKindEnum"], string> = {
  GOVERNMENT_ID: "Government photo ID",
  ADDRESS_PROOF: "Proof of address",
  TAX: "Tax document",
  BANK: "Bank document",
  BACKGROUND_CHECK: "Background check",
  OTHER: "Document",
};

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
  if (transitions.length === 0) return null;

  return (
    <section>
      <h2 className="pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        What has happened
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
                {describeTransition(transition.from_status, transition.to_status)}
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
const ARRIVED: Record<string, string> = {
  DRAFT: "You started your application",
  SUBMITTED: "You sent it for review",
  UNDER_REVIEW: "A reviewer started checking it",
  CHANGES_REQUIRED: "We asked you to correct something",
  APPROVED: "You were approved",
  SUSPENDED: "Your account was suspended",
  OFFBOARDED: "Your account was closed",
};

function describeTransition(from: string, to: string): string {
  return ARRIVED[to] ?? `${from} → ${to}`;
}
