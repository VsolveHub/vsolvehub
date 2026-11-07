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
import { isListingTrack, isUnchosenDraft, trackPreview, type StartTrack } from "../model/steps";
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

  if (isMissing || query.data === undefined || isUnchosenDraft(query.data)) return <NotStarted />;

  return <Standing application={query.data} />;
}

/**
 * Nobody has applied yet: what will you do on VSolve?
 *
 * Three plain choices. Tapping one does not start anything; it shows what happens next — the
 * steps, how long, the one document, and what approval leads to — with Start and a way back.
 * A wrong tap used to commit the applicant to the wrong form with nothing on screen saying so.
 */
function NotStarted() {
  const t = useT();
  const router = useRouter();
  const start = useUpdateApplication();
  const [chosen, setChosen] = useState<StartTrack | null>(null);

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
      <div role="radiogroup" aria-label={t("apply.overview.notStarted.whatWillYouDo")} className="grid gap-3">
        {TRACK_CHOICES.map(({ track, titleKey, descriptionKey, icon: Icon }) => (
          <TrackCard
            key={track}
            selected={chosen === track}
            onSelect={() => setChosen(track)}
            icon={<Icon size={22} aria-hidden />}
            title={t(titleKey)}
            description={t(descriptionKey)}
          />
        ))}
      </div>

      {chosen ? (
        <TrackPreview
          track={chosen}
          pending={start.isPending}
          failed={start.isError}
          onStart={() =>
            start.mutate({ track: chosen }, { onSuccess: () => router.push("/apply/about") })
          }
          onBack={() => setChosen(null)}
        />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          <Promise>{t("apply.overview.promise.notSentUntilYouSend")}</Promise>
          <Promise>{t("apply.overview.promise.notSharedUntilApproved")}</Promise>
        </ul>
      )}
    </section>
  );
}

/** What a chosen way of joining asks for, before the applicant commits to it. */
function TrackPreview({
  track,
  pending,
  failed,
  onStart,
  onBack,
}: {
  track: StartTrack;
  pending: boolean;
  failed: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const preview = trackPreview(track);

  return (
    <section
      aria-labelledby="track-preview-title"
      className="flex flex-col gap-4 rounded-card border border-action bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="track-preview-title" className="text-base font-bold text-navy-900">
          {t("apply.overview.preview.title")}
        </h2>
        <span className="text-sm text-text-secondary">{t(preview.timeKey)}</span>
      </div>
      <ol className="flex list-none flex-col gap-2 p-0">
        {preview.steps.map((step, index) => (
          <li key={step.href} className="flex items-center gap-3 text-sm text-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-bold text-navy-900">
              {index + 1}
            </span>
            {t(step.labelKey)}
          </li>
        ))}
      </ol>
      <p className="text-sm text-text-secondary">{t("apply.overview.preview.need")}</p>
      <p className="rounded-control bg-surface-sunken p-3 text-sm text-text">{t(preview.afterKey)}</p>
      {failed ? <p className="text-sm text-danger-text">{t("apply.overview.startFailed")}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
        <Button size="lg" onClick={onStart} loading={pending} className="font-bold sm:min-w-40">
          {t("apply.overview.preview.start")}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          {t("apply.overview.preview.back")}
        </Button>
      </div>
    </section>
  );
}

/** One way to join, drawn as something you pick. */
function TrackCard({
  icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-3.5 rounded-card border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow] hover:border-action hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        selected ? "border-action ring-2 ring-action/30" : "border-line",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center self-start rounded-control bg-action-surface text-action">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-navy-900">{title}</span>
        <span className="text-sm text-text-secondary">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-action bg-action text-surface" : "border-line-strong",
        )}
      >
        {selected ? <Check size={14} strokeWidth={3} /> : null}
      </span>
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

      {application.status === "DRAFT" ? <SwitchTrack current={application.track} /> : null}

      <History application={application} />

      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </section>
  );
}

const TRACK_CHOICES = [
  {
    track: "SERVICES",
    titleKey: "apply.overview.track.services.title",
    descriptionKey: "apply.overview.track.services.description",
    icon: Wrench,
  },
  {
    track: "STAY_HOST",
    titleKey: "apply.overview.track.stays.title",
    descriptionKey: "apply.overview.track.stays.description",
    icon: BedDouble,
  },
  {
    track: "RENTAL_OWNER",
    titleKey: "apply.overview.track.rentals.title",
    descriptionKey: "apply.overview.track.rentals.description",
    icon: Package,
  },
] as const;

/**
 * Switching between services, stays and rentals while the application is still a draft.
 *
 * The first screen is the only other place the choice is made, and it is gone once a draft
 * exists, so without this a partner who tapped the wrong card had no way back. Only in DRAFT:
 * once a reviewer has asked for changes, the application they looked at stays what it was.
 */
function SwitchTrack({ current }: { current: string }) {
  const t = useT();
  const router = useRouter();
  const update = useUpdateApplication();
  const others = TRACK_CHOICES.filter((choice) => choice.track !== current);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5">
      <h2 className="text-sm font-bold text-text">{t("apply.overview.switch.title")}</h2>
      <p className="mt-1 text-xs text-text-secondary">{t("apply.overview.switch.hint")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {others.map(({ track, titleKey, icon: Icon }) => (
          <Button
            key={track}
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ track }, { onSuccess: () => router.push("/apply/about") })}
          >
            <Icon size={16} aria-hidden />
            {t(titleKey)}
          </Button>
        ))}
      </div>
      {update.isError ? <p className="mt-2 text-sm text-danger-text">{t("apply.overview.startFailed")}</p> : null}
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
