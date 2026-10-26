"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton, cn } from "@vsolve/ui";
import { ArrowRight, BedDouble, Check, ChevronRight, Package, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { canSubmit, isEditable, rejectedDocuments } from "../model/readiness";
import { usePartnerApplication, useUpdateApplication } from "../queries";
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
 * short one. The first question decides the path: someone listing their own
 * property skips the trades, areas and hours that only matter for people who
 * travel to a customer.
 */
function NotStarted() {
  const router = useRouter();
  const start = useUpdateApplication();

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

      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-bold text-navy-900">What will you do on VSolve?</h2>
        <p className="text-sm text-text-secondary">Tap one to start your application.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TrackCard
          href="/apply/about"
          icon={<Wrench size={22} aria-hidden />}
          title="Offer services"
          description="Repairs, cleaning and other work at customers’ homes. You choose your areas and hours."
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "STAY_HOST" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<BedDouble size={22} aria-hidden />}
          title="Stays"
          description="Rooms, PG, hostel or hotel. Just your details, the agreements and an ID — about three minutes."
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "RENTAL_OWNER" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<Package size={22} aria-hidden />}
          title="Rent out items"
          description="Tools and equipment. Same short application: your details, the agreements and an ID."
        />
      </div>
      {start.isError ? (
        <p className="text-sm text-danger-text">We could not start that. Please try again.</p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        <Promise>Nothing is sent for review until you choose to send it</Promise>
        <Promise>Nothing is shared with customers until you are approved</Promise>
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
  const steps = stepProgress(application);
  const summary = progressSummary(application);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application);

  return (
    <section className="flex flex-col gap-6 pb-20">
      <h1 className="sr-only">Your application</h1>

      <ApplicationStatusBanner application={application} />

      {/* Reviewer Rejections Alarm */}
      {rejected.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-warning-line bg-warning-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-warning-text flex items-center gap-2">
            <span>⚠️ Action Required: Replace {rejected.length === 1 ? "this document" : "these documents"}</span>
          </h2>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {rejected.map((document) => (
              <li key={document.id} className="rounded-control bg-surface/80 p-3 border border-warning-line/60">
                <p className="text-xs font-bold text-warning-text">
                  {DOCUMENT_LABELS[document.kind]}
                </p>
                {document.review_reason ? (
                  <p className="text-xs leading-relaxed text-text-secondary mt-1">
                    {document.review_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href="/apply/documents"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-signal-500 hover:bg-signal-600 px-5 text-xs font-bold text-white transition-colors"
          >
            Upload Replacement Documents
          </Link>
        </div>
      ) : null}

      {/* Primary Progress Hero Card */}
      {editable ? <NextAction summary={summary} ready={ready} /> : null}

      {/* Structured Steps Checklist */}
      <StepList steps={steps} />

      {/* Specialist & Contractor Option — not for someone listing their own property. */}
      {application.track === "STAY_HOST" || application.track === "RENTAL_OWNER" ? null : (
        <section className="rounded-3xl border border-line bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-navy-900">Contractor & Multi-Crew Supply</h2>
              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[10px] font-bold text-text-muted border border-line">
                Optional
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1 max-w-md leading-relaxed">
              Have a crew of 3+ technicians? Dispatch work teams and bid for custom corporate contracts.
            </p>
          </div>
          <Link
            href="/apply/capabilities"
            className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-surface-sunken px-5 text-xs font-bold text-navy-900 transition-colors shadow-xs shrink-0"
          >
            <span>Explore Crew Rates</span>
          </Link>
        </section>
      )}

      {application.status === "APPROVED" ? (
        <Approved track={application.track} />
      ) : null}

      <History transitions={application.transitions} />
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
  const percent = Math.round(summary.fraction * 100);
  const remaining = summary.total - summary.done;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#00112e] text-white p-6 sm:p-8 shadow-2xl border border-white/10 flex flex-col gap-6">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-signal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Top Status & Count Row */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal-500" />
          </span>
          <span className="text-xs font-black uppercase tracking-wider text-amber-300">
            Application Progress
          </span>
        </div>

        <span className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-extrabold text-white border border-white/20 shadow-xs tabular-nums">
          {ready ? "All Required Steps Done" : `${summary.done} of ${summary.total} Completed`}
        </span>
      </div>

      {/* Headline & Description */}
      <div className="relative z-10">
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {ready ? "Application Complete!" : `${remaining} ${remaining === 1 ? "step" : "steps"} remaining`}
        </h2>
        <p className="text-xs sm:text-sm text-navy-200 mt-2 leading-relaxed max-w-lg">
          {ready
            ? "All required steps are filled. Review your profile details and submit for verification."
            : `Next up: Complete your ${summary.nextIncomplete?.label.toLowerCase() ?? "documents"} to submit for fast 24h approval.`}
        </p>
      </div>

      {/* Progress Track */}
      <div className="relative z-10 flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-navy-200">
          <span>Overall Completion</span>
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
          className="flex h-13 w-full items-center justify-center rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-6 text-sm font-extrabold text-[#00112e] shadow-xl shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 hover:scale-[1.01] transition-all active:scale-[0.99]"
        >
          <span>
            {ready
              ? "Review & Submit Application"
              : `Continue to ${summary.nextIncomplete?.label ?? "Next Step"}`}
          </span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Clean & Modern Steps Checklist
 */
function StepList({ steps }: { steps: readonly StepProgress[] }) {
  const rows = steps.filter((step) => step.state !== "waypoint");

  return (
    <section className="flex flex-col gap-3 mt-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-black uppercase tracking-wider text-navy-900">
          Application Checklist
        </h2>
        {/*
          "Tap", not "Click". Onboarding is a phone flow — the shell that wraps
          it is a 375px column — and a vendor filling this in on site is not
          clicking anything.
        */}
        <span className="text-xs font-semibold text-text-secondary">
          Tap any step to edit
        </span>
      </div>

      <div className="rounded-3xl border border-line bg-white shadow-xs overflow-hidden divide-y divide-line">
        {rows.map((step, idx) => {
          const isDone = step.state === "done";
          const isOptional = step.state === "optional";
          const isNext = !isDone && !isOptional;

          return (
            <Link
              key={step.href}
              href={step.href}
              className={cn(
                "flex items-center justify-between gap-4 p-4 sm:p-5 transition-all duration-200 group",
                isNext ? "bg-amber-50/30 hover:bg-amber-50/60" : "hover:bg-surface-sunken/60",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
              )}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-xs font-black transition-transform duration-200 group-hover:scale-105",
                    isDone
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"
                      : isNext
                        ? "bg-signal-500 text-white shadow-md shadow-signal-500/25"
                        : "bg-surface-sunken text-text-muted border border-line",
                  )}
                >
                  {isDone ? (
                    <Check size={18} strokeWidth={3} aria-hidden />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-navy-900 group-hover:text-signal-700 transition-colors">
                      {step.label}
                    </span>
                    {isNext && (
                      <span className="hidden sm:inline-block rounded-full bg-signal-100 text-signal-800 text-[10px] font-extrabold px-2 py-0.5 border border-signal-200">
                        Next Up
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-secondary mt-0.5">
                    {isDone
                      ? "Completed and verified"
                      : isOptional
                        ? "Optional schedule preferences"
                        : step.outstanding === 1
                          ? "Required details missing"
                          : `${step.outstanding} items required`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold border transition-colors",
                    isDone
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : isNext
                        ? "bg-signal-50 text-signal-800 border-signal-200 font-extrabold"
                        : "bg-surface-sunken text-text-muted border-line",
                  )}
                >
                  {isDone ? "Done" : isOptional ? "Optional" : "Incomplete"}
                </span>
              </div>
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
  if (track === "RENTAL_OWNER") {
    return (
      <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
        <p className="text-[0.9375rem] font-bold text-success-text">You are approved</p>
        <p className="text-[0.875rem] leading-relaxed text-success-text/85">
          Add the items you rent out. Customers can book them once an ad is live.
        </p>
        <Link
          href="/rentals"
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          List an item
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    );
  }
  if (track === "STAY_HOST") {
    return (
      <div className="flex flex-col gap-2.5 rounded-card border border-success-line bg-success-surface p-4">
        <p className="text-[0.9375rem] font-bold text-success-text">You are approved</p>
        <p className="text-[0.875rem] leading-relaxed text-success-text/85">
          Add your property and rooms, publish, and guest enquiries will come to you.
        </p>
        <Link
          href="/stays"
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-control bg-success-text px-6 text-[0.9375rem] font-bold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          List your property
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    );
  }
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
  DECLINED: "Your application was not approved",
};

function describeTransition(from: string, to: string): string {
  // A reviewer handing it back to the queue, not the applicant sending it again.
  if (from === "UNDER_REVIEW" && to === "SUBMITTED") return "It went back in the queue for the next reviewer";
  if (from === "SUSPENDED" && to === "APPROVED") return "Your account was reinstated";
  return ARRIVED[to] ?? `${from} → ${to}`;
}
