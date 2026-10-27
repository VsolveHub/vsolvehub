"use client";

import { isMaterialAdvance, orderedStages } from "@vsolve/query";
import { Badge, buttonStyles, cn, formatMoney, useT } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { HOW_DAY_HIRE_WORKS_HREF, overtimeLine } from "@/features/crew-offer/model/offer-state";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import {
  describeEngagementStatus,
  getProjectWording,
  getWorkforceWording,
  describeStageStatus,
  stageTitle,
  type StageWording,
  type StatusTone,
} from "@/features/engagement/model/engagement-copy";
import type { Engagement, EngagementStage } from "@/features/engagement/queries";
import { ProblemSheet } from "@/features/shift/view/problem-sheet";
import { shortDate } from "@/lib/format";

import {
  collectedDirectlyPaise,
  dayChipDate,
  describeShiftDay,
  nextCrewAction,
  type DayChipTone,
} from "../model/day-chip";

/**
 * The M2 engagement job screen.
 *
 * One agreement, reached from `DoingCard` in the merged WORK stack and from the
 * two old detail routes `next.config.ts` redirects here.
 *
 * ## Two branches, decided by `commercial_mode`
 *
 * `LEAD_ONLY` is the A3 day-hire booking and gets the **job hub** below: the
 * customer, the site, the terms, one chip per day and the next thing to do.
 * `MANAGED_PAYMENT_REQUIRED` is the A5 project and keeps the stage list it has
 * always had. `M2-FE-111` forbids flattening either into the other.
 *
 * ## The A3 hub reads contract 1.49.0
 *
 * `crew_terms`, `site_address`, `customer_contact` and `stages[].shift_summary`
 * are all nullable: the address and contact are withheld until the booking fee
 * is verified (`contact_released_at`), and a record written before 1.49.0 has
 * no terms at all. Every line here renders nothing rather than a placeholder
 * when its field is null.
 */
export function EngagementJobView({ engagement }: { readonly engagement: Engagement }) {
  if (engagement.commercial_mode === "LEAD_ONLY") {
    return isJobOver(engagement) ? (
      <CrewJobSummary engagement={engagement} />
    ) : (
      <CrewJobHub engagement={engagement} />
    );
  }
  return <ProjectJobView engagement={engagement} />;
}

/** Every status past the last working day. */
function isJobOver(engagement: Engagement): boolean {
  return ["COMPLETING", "COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status);
}

/* ==========================================================================
   A3 — the job hub
   ========================================================================== */

const STATUS_BADGE_TONE: Record<StatusTone, "action" | "info" | "neutral" | "warning" | "danger" | "success"> = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
  success: "success",
};

function addressText(address: NonNullable<Engagement["site_address"]>): string {
  return [
    address.line1,
    address.line2,
    address.landmark,
    address.locality,
    address.city,
    address.state,
    address.postal_code,
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}

/** The server's route to the Customer's pin; a search for the text only if it sent none. */
function mapHref(address: NonNullable<Engagement["site_address"]>): string {
  if (address.directions_url) return address.directions_url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(address))}`;
}

function shortAddress(address: NonNullable<Engagement["site_address"]>): string {
  return [address.line1, address.line2, address.locality]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}

function CrewJobHub({ engagement }: { readonly engagement: Engagement }) {
  const t = useT();
  const [problemOpen, setProblemOpen] = useState(false);
  const status = describeEngagementStatus(engagement, getWorkforceWording(t), t);
  const stages = orderedStages(engagement).filter((stage) => stage.shift_summary !== null);
  const terms = engagement.crew_terms;
  const address = engagement.site_address;
  const customer = engagement.customer_contact;
  const next = nextCrewAction(stages, t);
  const overtime = terms ? overtimeLine(t, terms.overtime_hourly_paise, terms.standard_day_hours) : null;
  const inclusions = terms?.inclusions.filter((line) => line.trim() !== "") ?? [];
  const dayHref = (stageId: string) => `/work/jobs/${engagement.id}/days/${stageId}`;

  return (
    <>
      <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
        <HubHeader title={engagement.service_name || t("work.engagementJob.crewBooking")}>
          {status ? (
            <Badge tone={STATUS_BADGE_TONE[status.tone]} dot>
              {status.label}
            </Badge>
          ) : null}
        </HubHeader>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-5">
          {customer ? (
            <p className="text-xl font-bold leading-tight text-text">{customer.name}</p>
          ) : null}

          {address ? (
            <ContactRow icon="distance" text={shortAddress(address)}>
              <a
                href={mapHref(address)}
                target="_blank"
                rel="noreferrer"
                className={buttonStyles({ variant: "outline", size: "sm" })}
              >
                {t("work.engagementJob.map")}
              </a>
            </ContactRow>
          ) : (
            <p className="text-sm leading-5 text-text-secondary">
              {t("work.engagementJob.addressLocked")}
            </p>
          )}

          {customer && customer.phone.trim() !== "" ? (
            <ContactRow icon="call" text={customer.name}>
              <a href={`tel:${customer.phone}`} className={buttonStyles({ variant: "outline", size: "sm" })}>
                {t("work.engagementJob.call")}
              </a>
            </ContactRow>
          ) : null}

          <div className="rounded-card border border-line bg-surface px-3.5 py-3">
            {terms ? (
              <>
                <p className="text-lg font-extrabold leading-tight tabular-nums text-text">
                  {t("work.engagementJob.toYouPerHead", {
                    total: formatMoney(terms.lead_receipt_paise),
                    perHead: formatMoney(terms.per_worker_day_paise),
                  })}
                </p>
                <p className="mt-0.5 text-sm leading-5 text-text-secondary">
                  {t("work.engagementJob.customerPaysEvening")}
                </p>
              </>
            ) : (
              <p className="text-lg font-extrabold leading-tight tabular-nums text-text">
                {t("work.engagementJob.agreed", { amount: formatMoney(engagement.staged_total_paise) })}
              </p>
            )}
          </div>

          <DayChips stages={stages} hrefFor={dayHref} />

          {inclusions.length > 0 ? (
            <p className="text-sm font-semibold leading-5 text-text">{inclusions.join(" · ")}</p>
          ) : null}
          {overtime ? <p className="text-sm leading-5 text-text-secondary">{overtime}</p> : null}

          {next ? (
            <Link
              href={dayHref(next.stageId)}
              className="mt-2 flex h-16 items-center justify-center gap-2 rounded-2xl bg-action text-base font-bold text-action-text shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {next.label}
              <Pictogram name="go" size="md" />
            </Link>
          ) : null}

          <div className="mt-1 flex items-center justify-between gap-3">
            <Link
              href={HOW_DAY_HIRE_WORKS_HREF}
              className="flex items-center gap-1.5 py-1 text-sm font-semibold text-action-secondary underline-offset-2 hover:underline"
            >
              <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-current text-xs">
                i
              </span>
              {t("work.engagementJob.howDayHireWorks")}
            </Link>
            <button
              type="button"
              onClick={() => setProblemOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-bold text-warning-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span aria-hidden>⚠</span> {t("work.engagementJob.problem")}
            </button>
          </div>
        </div>
      </main>

      <ProblemSheet
        engagementId={engagement.id}
        requirementId={engagement.requirement}
        stageId={next?.stageId}
        open={problemOpen}
        onOpenChange={setProblemOpen}
      />
    </>
  );
}

/** The chips, one per shift-day, scrolling sideways. */
function DayChips({
  stages,
  hrefFor,
}: {
  readonly stages: readonly EngagementStage[];
  readonly hrefFor: (stageId: string) => string;
}) {
  const t = useT();
  if (stages.length === 0) return null;
  return (
    <section aria-label={t("work.engagementJob.days")}>
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        {t("work.engagementJob.days")}
      </h2>
      <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1">
        {stages.map((stage) => {
          const chip = describeShiftDay(stage.shift_summary!, t);
          const date =
            dayChipDate(stage.scheduled_on) ??
            t("work.engagementJob.dayPosition", { position: stage.position });
          const cancelled = stage.status === "CANCELLED";
          return (
            <Link
              key={stage.id}
              href={hrefFor(stage.id)}
              aria-label={`${date}, ${cancelled ? t("work.engagementJob.cancelledLower") : chip.label}`}
              className={cn(
                "flex min-h-14 shrink-0 flex-col justify-center gap-0.5 rounded-2xl border px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                cancelled ? "border-line bg-surface-sunken opacity-60" : DAY_CHIP_TONE[chip.tone],
              )}
            >
              <span className="text-sm font-bold text-text">{date}</span>
              <span className="max-w-[14ch] truncate text-xs font-semibold">
                {cancelled ? t("work.engagementJob.cancelled") : chip.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const DAY_CHIP_TONE: Record<DayChipTone, string> = {
  action: "border-action-line bg-action-surface text-warning-text",
  info: "border-selected-line bg-selected-surface text-action-secondary",
  neutral: "border-line bg-surface text-text-muted",
  warning: "border-warning-line bg-warning-surface text-warning-text",
  danger: "border-danger-line bg-danger-surface text-danger-text",
  success: "border-success-line bg-success-surface text-success-text",
};

function ContactRow({
  icon,
  text,
  children,
}: {
  readonly icon: PictogramName;
  readonly text: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-2.5">
      <Pictogram name={icon} size="md" className="shrink-0 text-action-secondary" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{text}</span>
      {children}
    </div>
  );
}

function HubHeader({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/13 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
      >
        <Pictogram name="back" size="md" className="text-surface" />
        <span className="sr-only">{t("common.back")}</span>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold leading-tight text-surface">{title}</h1>
      {children}
    </div>
  );
}

/* ==========================================================================
   A3 — job done
   ========================================================================== */

/**
 * The hub once the last day is closed: one row per day from `shift_summary`,
 * the total collected directly, and the rating.
 *
 * Overtime hours are not on `shift_summary`, so a row shows the count and the
 * settled amount only — the amount already includes any approved extra.
 */
function CrewJobSummary({ engagement }: { readonly engagement: Engagement }) {
  const t = useT();
  const stages = orderedStages(engagement).filter((stage) => stage.shift_summary !== null);
  const collected = collectedDirectlyPaise(stages);
  const customer = engagement.customer_contact;
  const title = [engagement.service_name || t("work.engagementJob.crewBooking"), customer?.name ?? null]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <>
      <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
        <HubHeader title={title}>
          <Badge tone="success" dot>
            {t("work.engagementJob.jobComplete")}
          </Badge>
        </HubHeader>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-5">
          {stages.length === 0 ? (
            <p className="text-sm leading-5 text-text-secondary">{t("work.engagementJob.noDays")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
              {stages.map((stage) => {
                const summary = stage.shift_summary!;
                const settled = summary.settlement_status === "SETTLED";
                const count =
                  summary.present_count === null
                    ? "—"
                    : t("work.engagementJob.presentOfExpected", {
                        present: summary.present_count,
                        expected: summary.expected_count,
                      });
                return (
                  <li key={stage.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                    <span className="w-12 shrink-0 font-bold text-text">
                      {dayChipDate(stage.scheduled_on) ??
                        t("work.engagementJob.dayPosition", { position: stage.position })}
                    </span>
                    <span className="min-w-0 flex-1 text-text-secondary">{count}</span>
                    <span className="shrink-0 font-bold tabular-nums text-text">
                      {summary.settlement_amount_paise === null
                        ? ""
                        : formatMoney(summary.settlement_amount_paise)}
                    </span>
                    <span
                      className={cn(
                        "w-14 shrink-0 text-right text-xs font-bold",
                        settled ? "text-success-text" : "text-text-muted",
                      )}
                    >
                      {settled
                        ? t("work.engagementJob.paid")
                        : stage.status === "CANCELLED"
                          ? t("work.engagementJob.cancelled")
                          : t("work.engagementJob.open")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {collected === null ? null : (
            <p className="flex items-baseline justify-between rounded-card border border-line bg-surface px-3.5 py-3">
              <span className="text-sm font-semibold text-text">{t("work.engagementJob.collectedDirectly")}</span>
              <span className="text-xl font-extrabold tabular-nums text-text">{formatMoney(collected)}</span>
            </p>
          )}
        </div>
      </main>
      <div className="bg-canvas px-4 pb-5">
        <CompletionRating
          subject="engagement"
          id={engagement.id}
          isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)}
        />
      </div>
    </>
  );
}

/* ==========================================================================
   A5 — the project stage list (unchanged)
   ========================================================================== */

/**
 * The headline figure is `staged_total_paise` — "now owed" — not
 * `commission_paise` (Vsolve's cut) and not `total_paise` (never moves).
 */
function ProjectJobView({ engagement }: { readonly engagement: Engagement }) {
  const t = useT();
  const router = useRouter();
  const wording: StageWording = getProjectWording(t);
  const status = describeEngagementStatus(engagement, wording, t);
  const stages = orderedStages(engagement);

  return (
    <>
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
      <h1 className="sr-only">
        {t("work.engagementJob.srTitle", { parent: wording.parent })}
        {status ? ` — ${status.label}` : ""}
      </h1>

      <div className="flex items-center gap-3.5 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/13 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
        >
          <Pictogram name="back" size="md" className="text-surface" />
          <span className="sr-only">{t("common.back")}</span>
        </button>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
            {t("work.engagementJob.agreedAt", { parent: wording.parent })}
          </span>
          <span className="min-w-0 truncate text-[2.125rem] font-extrabold leading-none tracking-[-0.02em] text-surface">
            {formatMoney(engagement.staged_total_paise)}
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-5">
        {stages.length === 0 ? (
          <EmptyStages wording={wording} />
        ) : (
          stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              wording={wording}
              href={isMaterialAdvance(stage) ? null : `/work/jobs/${engagement.id}/stages/${stage.id}`}
            />
          ))
        )}
      </div>
    </main>
    <div className="bg-canvas px-4 pb-5">
      <CompletionRating
        subject="engagement"
        id={engagement.id}
        isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)}
      />
    </div>
    </>
  );
}

/**
 * A picture, a date and a number. The row's whole accessible name is assembled
 * here: the stage's own title, what state it is in, and what it is worth.
 */
function StageRow({
  stage,
  wording,
  href,
}: {
  readonly stage: EngagementStage;
  readonly wording: StageWording;
  readonly href: string | null;
}) {
  const t = useT();
  const status = describeStageStatus(stage, wording, t);
  const scheduled = stage.scheduled_on;

  const label = [
    stageTitle(stage, wording, t),
    status?.label,
    scheduled ? shortDate(scheduled) : null,
    formatMoney(stage.amount_paise),
  ]
    .filter((part): part is string => part !== null && part !== undefined)
    .join(", ");

  const body = (
    <>
      <span
        className={cn(
          "grid h-13 w-13 shrink-0 place-items-center rounded-2xl border",
          status ? STAGE_TONE[status.tone] : STAGE_TONE.neutral,
        )}
      >
        <Pictogram
          name={isMaterialAdvance(stage) ? "price" : STAGE_PICTOGRAM[stage.status]} size="lg"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold leading-snug text-text">
          {stageTitle(stage, wording, t)}
        </span>
        <span className="text-xl font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text">
          {formatMoney(stage.amount_paise)}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          {status ? (
            <span className="truncate text-xs font-bold uppercase tracking-[0.04em] text-text-muted">
              {status.label}
            </span>
          ) : null}
          {scheduled ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-action-secondary">
              <Pictogram name="date" size="sm" className="shrink-0" />
              <span className="truncate">{shortDate(scheduled)}</span>
            </span>
          ) : null}
        </span>
      </span>

      {href ? <Pictogram name="go" size="md" className="shrink-0 text-action-secondary" /> : null}
    </>
  );

  const shell =
    "flex min-h-18 items-center gap-3 rounded-card border border-line bg-surface p-3.5";

  // A material advance is money for cement, not a day of work: nothing to open.
  if (href === null) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        shell,
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * An agreement with no stages on it yet. Real: `PENDING_START` is a published
 * status and an A5 project is staged when its estimate is accepted.
 */
function EmptyStages({ wording }: { readonly wording: StageWording }): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16">
      <div className="grid h-42 w-42 place-items-center rounded-full bg-surface-sunken">
        <Pictogram name="papers" className="h-21 w-21 text-[var(--color-warm-400)]" />
      </div>
      <p className="mt-5 text-base font-semibold text-text-secondary">
        {t("work.engagementJob.noStages", { many: wording.many, parent: wording.parent })}
      </p>
    </div>
  );
}

/**
 * One glyph per stage status, as a total record so that a status added to
 * `EngagementStageStatusEnum` is a typecheck failure rather than a blank tile.
 */
const STAGE_PICTOGRAM: Record<EngagementStage["status"], PictogramName> = {
  PENDING: "time",
  IN_PROGRESS: "doing",
  AWAITING_REVIEW: "held",
  APPROVED: "done",
  CORRECTION_REQUESTED: "later",
  DISPUTED: "stopped",
  RELEASED: "money",
  CANCELLED: "no",
};

/** `describeStageStatus`'s six tones, in this redesign's closed token set. */
const STAGE_TONE: Record<StatusTone, string> = {
  action: "border-action-line bg-action-surface text-warning-text",
  info: "border-selected-line bg-selected-surface text-action-secondary",
  neutral: "border-line bg-surface-sunken text-text-muted",
  warning: "border-warning-line bg-warning-surface text-warning-text",
  danger: "border-danger-line bg-danger-surface text-danger-text",
  success: "border-success-line bg-success-surface text-success-text",
};
