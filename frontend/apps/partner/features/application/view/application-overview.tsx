"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, buttonStyles, cn, useT, type Translator } from "@vsolve/ui";
import { BedDouble, Check, ChevronRight, Package, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { progressSummary, stepProgress } from "../model/progress";
import { isEditable, replaceableRejectedDocuments } from "../model/readiness";
import { documentLabelKey } from "../model/status";
import { isListingTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability, useUpdateApplication } from "../queries";
import { HelpSheet } from "./account-menu";
import { StepMark } from "./apply-shell";
import { DocumentSlot } from "./document-upload";
import { ApplicationStatusTracker } from "./status-banner";

/**
 * Where the application stands, and the one thing to do next.
 *
 * Three things, top to bottom, each said once: the status tracker (where it is
 * and what happens next), what is needed from the Partner (a document they may
 * replace, or the steps still open, with one button to the next one), and what
 * has happened.
 *
 * Every action here comes from the server's own flags (`can_edit`,
 * `can_replace`), so a declined application shows its decision and a way to
 * contact support — never an upload the API will refuse.
 *
 * Sending lives on `/apply/review`: one place that sends an application is one
 * place that has to get the agreements, the conflict recovery and the wording right.
 */

type Application = Schemas["PartnerApplication"];

export function ApplicationOverview() {
  const t = useT();
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <div role="status" aria-label={t("apply.editor.loadingAriaLabel")} className="flex flex-col gap-4">
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
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
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
  const t = useT();
  const router = useRouter();
  const start = useUpdateApplication();

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-5 py-7 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface/15 text-surface">
          <Sparkles size={26} aria-hidden />
        </span>
        <h1 className="text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-surface">
          {t("apply.overview.notStarted.title")}
        </h1>
        <p className="max-w-[32ch] text-[0.9375rem] leading-relaxed text-navy-200">
          {t("apply.overview.notStarted.subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-bold text-navy-900">{t("apply.overview.notStarted.whatWillYouDo")}</h2>
        <p className="text-sm text-text-secondary">{t("apply.overview.notStarted.tapToStart")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TrackCard
          href="/apply/about"
          icon={<Wrench size={22} aria-hidden />}
          title={t("apply.overview.track.services.title")}
          description={t("apply.overview.track.services.description")}
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "STAY_HOST" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<BedDouble size={22} aria-hidden />}
          title={t("apply.overview.track.stays.title")}
          description={t("apply.overview.track.stays.description")}
        />
        <TrackCard
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ track: "RENTAL_OWNER" }, { onSuccess: () => router.push("/apply/about") })
          }
          icon={<Package size={22} aria-hidden />}
          title={t("apply.overview.track.rentals.title")}
          description={t("apply.overview.track.rentals.description")}
        />
      </div>
      {start.isError ? (
        <p className="text-sm text-danger-text">{t("apply.overview.startFailed")}</p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        <Promise>{t("apply.overview.promise.notSentUntilYouSend")}</Promise>
        <Promise>{t("apply.overview.promise.notSharedUntilApproved")}</Promise>
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
  const t = useT();
  const availability = usePartnerAvailability();
  const [helpOpen, setHelpOpen] = useState(false);
  const steps = stepProgress(application, availability.data);
  const summary = progressSummary(application, availability.data);
  const replaceable = replaceableRejectedDocuments(application);
  const editable = isEditable(application);
  const closed =
    application.status === "DECLINED" ||
    application.status === "SUSPENDED" ||
    application.status === "OFFBOARDED";
  const showCrew = editable && !isListingTrack(application.track);

  return (
    <section className="flex flex-col gap-4">
      <ApplicationStatusTracker application={application} />

      {replaceable.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-text">{t("apply.overview.needs.title")}</h2>
          {replaceable.map((document) => (
            <DocumentSlot key={document.id} application={application} kind={document.kind} required />
          ))}
        </section>
      ) : null}

      {editable ? (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5">
          <ul className="flex list-none flex-col divide-y divide-line p-0">
            {steps
              .filter((step) => step.state !== "waypoint")
              .map((step) => (
                <li key={step.href}>
                  <Link href={step.href} className="flex min-h-14 items-center gap-3 py-2.5 hover:bg-surface-hover">
                    <StepMark state={step.state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-text">{t(step.labelKey)}</span>
                      <span className="truncate text-xs text-text-secondary">
                        {step.state === "done"
                          ? t("common.done")
                          : step.state === "optional"
                            ? t("apply.shell.describe.optional")
                            : t("apply.shell.describe.outstanding", { count: step.outstanding })}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
          </ul>
          <Link
            href={summary.nextIncomplete?.href ?? "/apply/review"}
            className={buttonStyles({ size: "lg", block: true, className: "font-bold" })}
          >
            {summary.nextIncomplete
              ? t("apply.overview.cta.continue", { step: t(summary.nextIncomplete.labelKey) })
              : t("apply.overview.cta.send")}
          </Link>
        </section>
      ) : null}

      {closed ? (
        <Button variant="outline" onClick={() => setHelpOpen(true)} className="self-start">
          {t("apply.help.title")}
        </Button>
      ) : null}

      {showCrew ? (
        <Link
          href="/apply/capabilities"
          className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:bg-surface-hover"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-text">{t("apply.overview.crew.title")}</span>
            <span className="block text-xs text-text-secondary">{t("apply.overview.crew.description")}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
        </Link>
      ) : null}

      <History application={application} />

      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </section>
  );
}

interface HistoryEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
}

/**
 * What has happened, newest first: the application's own steps and the document events that
 * matter to the Partner (a document rejected, a new one uploaded).
 *
 * The server already leaves out what is not for the applicant (a reviewer's private note, a
 * hand-back to the queue), so every reason shown here was written for them.
 */
function History({ application }: { application: Application }) {
  const t = useT();
  const entries: HistoryEntry[] = [
    ...application.transitions.map((transition) => ({
      id: transition.id,
      at: transition.occurred_at,
      title:
        transition.reason_code === "application_resubmitted"
          ? t("apply.overview.history.resubmitted")
          : describeTransition(transition.from_status, transition.to_status, t),
      detail: transition.reason,
    })),
    ...application.documents.flatMap((document) => {
      const label = t(documentLabelKey(document.kind));
      const events: HistoryEntry[] = [];
      if (document.version > 1) {
        events.push({
          id: `${document.id}:uploaded`,
          at: document.uploaded_at,
          title: t("apply.overview.history.documentReplaced", { document: label }),
          detail: "",
        });
      }
      if (document.status === "REJECTED" && document.reviewed_at) {
        events.push({
          id: `${document.id}:rejected`,
          at: document.reviewed_at,
          title: t("apply.overview.history.documentRejected", { document: label }),
          detail: document.review_reason,
        });
      }
      return events;
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="pb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
        {t("apply.overview.history.heading")}
      </h2>
      <ol className="flex list-none flex-col p-0">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex gap-3">
            <span aria-hidden className="flex flex-col items-center">
              <span
                className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", index === 0 ? "bg-action" : "bg-line-strong")}
              />
              {index === entries.length - 1 ? null : <span className="w-px flex-1 bg-line" />}
            </span>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-sm font-semibold text-text">{entry.title}</p>
              {entry.detail ? <p className="mt-0.5 text-sm text-text-secondary">{entry.detail}</p> : null}
              <time dateTime={entry.at} className="mt-1 block text-xs text-text-muted">
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(entry.at))}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What arriving at each status actually meant for the applicant. */
const ARRIVED_KEY: Record<string, string> = {
  DRAFT: "apply.overview.history.arrived.DRAFT",
  SUBMITTED: "apply.overview.history.arrived.SUBMITTED",
  UNDER_REVIEW: "apply.overview.history.arrived.UNDER_REVIEW",
  CHANGES_REQUIRED: "apply.overview.history.arrived.CHANGES_REQUIRED",
  APPROVED: "apply.overview.history.arrived.APPROVED",
  SUSPENDED: "apply.overview.history.arrived.SUSPENDED",
  OFFBOARDED: "apply.overview.history.arrived.OFFBOARDED",
  DECLINED: "apply.overview.history.arrived.DECLINED",
};

function describeTransition(from: string, to: string, t: Translator["t"]): string {
  if (from === "SUSPENDED" && to === "APPROVED") return t("apply.overview.history.reinstated");
  const key = ARRIVED_KEY[to];
  return key ? t(key) : `${from} → ${to}`;
}
