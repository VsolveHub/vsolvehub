"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  Dialog,
  ErrorState,
  Field,
  Input,
  Select,
  Textarea,
} from "@vsolve/ui";
import {
  SHIFT_SAFETY_CATEGORIES,
  SHIFT_SAFETY_SEVERITIES,
  describeError,
  isPolicyUnavailable,
  type ShiftSafetyCategory,
  type ShiftSafetySeverity,
} from "@vsolve/query";
import { LifeBuoy, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { timeAgo } from "@/lib/format";

import {
  PARTNER_CREW_NO_SHOW_REASONS,
  useReportCrewNoShow,
  useReportSafetyIncident,
  useSafetyIncidents,
  type PartnerCrewNoShowReason,
  type ShiftDay,
} from "../queries";
import {
  NO_SHOW_REASON_LABEL,
  SAFETY_CATEGORY_LABEL,
  SAFETY_IS_NOT_A_CANCELLATION,
  SEVERITY_LABEL,
} from "../model/shift-copy";

/**
 * When the day goes wrong — `M2-FE-507`, with `M2-FE-508`'s safety report beside
 * it.
 *
 * ## This is a router, not a form
 *
 * `M2-FE-507` names five situations: no-show, partial crew, late arrival, unsafe
 * site and Customer-unavailable. **Three of them already have a command and two
 * of them do not**, and the honest screen is one that sends each to the thing
 * that actually records it rather than one that collects five kinds of report
 * into a box nothing reads.
 *
 * - **Partial crew** is the attendance count. `n of m` with `n` short *is* the
 *   report — the shortfall is published, the customer chooses what happens to
 *   the missing worker-days, and the day settles at the present workers' rate
 *   either way. A second "report a partial crew" form would be a second number
 *   for one fact.
 * - **Nobody came** is the same control at zero, once the day has started.
 * - **Customer unavailable / gate locked, on day one** is
 *   `POST /requirements/{id}/crew/no-show/`, and it moves money — so it sits
 *   behind a confirmation that states what it costs the customer.
 * - **Unsafe site** is a safety incident, which is a first-class record and
 *   **never a cancellation reason**. It is offered as a report, and this app
 *   nowhere offers it as a way to end a job.
 * - **Late arrival** has no endpoint. It is not invented one: arrival stamps the
 *   time it is confirmed, which *is* the record of when the crew got there, and
 *   where the delay cost hours the paid path is an overtime request at the
 *   published rate. Said plainly, with support as the escalation. Logged in
 *   `frontend-execution-plan.md` §7.
 *
 * ## Evidence
 *
 * There is no evidence upload on this panel and that is deliberate: A3 evidence
 * attaches to the shift-day stage through the composer on the booking screen,
 * which is one upload path rather than two. The link says so.
 */

export interface SiteReportPanelProps {
  readonly day: ShiftDay;
  readonly engagementId: string;
  /**
   * The requirement the booking fee lives on. Needed for the day-one no-show.
   *
   * Empty when the booking read that carries it failed. The no-show route is
   * then not offered at all rather than being drawn against an id this screen
   * does not have — support is the path, and it is the honest one.
   */
  readonly requirementId: string;
  /** Where the stage evidence composer lives. */
  readonly bookingHref: string;
  /** False when the grant no longer carries `incident.report`. */
  readonly canReport: boolean;
}

export function SiteReportPanel({
  day,
  engagementId,
  requirementId,
  bookingHref,
  canReport,
}: SiteReportPanelProps) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowReason, setNoShowReason] = useState<PartnerCrewNoShowReason>("customer_no_show");

  // Both ids: the requirement is what the command is addressed to, the
  // engagement is what its `M2Command` row needs to reach this app's booking
  // list. See `useReportCrewNoShow`.
  const noShow = useReportCrewNoShow({ requirementId, engagementId });

  const arrived = day.attendance?.arrival_confirmed_at != null;
  // The no-show route settles the booking fee, which is earned on the first
  // day's arrival. Offering it on day three would be offering a command the
  // server can only refuse.
  const dayOneNotStarted = day.position === 1 && !arrived && requirementId !== "";

  return (
    <Card className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <TriangleAlert size={18} aria-hidden />
          If the day goes wrong
        </h2>
        <p className="text-sm leading-6 text-text-secondary">
          Each of these is recorded somewhere different, so Vsolve can tell them apart later.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        <ReportRoute
          title="Some of my crew did not come"
          detail="Record the day with the number who were actually here. That is the report — the shortfall goes to the customer, and the day settles for the people who came, at their rate."
        />
        <ReportRoute
          title="Nobody from my crew could come"
          detail="Record the day with zero present once it has started. If it is the first day and nothing has begun at all, contact support — a vendor no-show refunds the customer's booking fee and sends the job back out, and that is not a decision this app makes for you on a tap."
          action={
            <Link
              href="/contact"
              className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Contact support
            </Link>
          }
        />
        <ReportRoute
          title="We arrived late"
          detail="Confirm the arrival when your crew actually gets there — the time Vsolve stamps is the record, and there is nothing else to file. If the delay pushed the shift past its published length, ask for the overtime above; unapproved overtime is not paid."
        />
        <ReportRoute
          title="The customer was not there, or we could not get in"
          detail={
            dayOneNotStarted
              ? "Report it below. On the first day this settles the booking fee, so read what it says before you confirm."
              : "This can only be reported on the first day, before anything has started — that is the day the booking fee turns on. After that, contact support."
          }
          action={
            dayOneNotStarted && canReport ? (
              <Button type="button" variant="secondary" onClick={() => setNoShowOpen(true)}>
                Report the customer was not there
              </Button>
            ) : (
              <Link
                href="/contact"
                className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Contact support
              </Link>
            )
          }
        />
        <ReportRoute
          title="The site is unsafe, or somebody was hurt"
          detail={SAFETY_IS_NOT_A_CANCELLATION}
          action={
            canReport ? (
              <Button
                type="button"
                variant="secondary"
                icon={<ShieldAlert size={16} aria-hidden />}
                onClick={() => setSafetyOpen(true)}
              >
                File a safety report
              </Button>
            ) : null
          }
        />
      </ul>

      <p className="text-xs leading-5 text-text-muted">
        Photographs and documents attach to the shift-day itself, on the{" "}
        <Link
          href={bookingHref}
          className="font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          booking screen
        </Link>
        . Anything you attach there is on the record and the customer reads it.
      </p>

      <SafetyHistory engagementId={engagementId} />

      <SafetyReportDialog
        open={safetyOpen}
        onOpenChange={setSafetyOpen}
        engagementId={engagementId}
        stageId={day.stage_id}
      />

      <ConfirmAction
        open={noShowOpen}
        onOpenChange={(open) => setNoShowOpen(open)}
        title="Report that the customer was not there"
        destructive
        pending={noShow.isPending}
        confirmLabel="Report it"
        consequence={
          <>
            Vsolve keeps the customer&rsquo;s booking fee rather than refunding it, and pays you a
            share of it for having travelled. The rest is Vsolve&rsquo;s. The job does not go back
            out to other vendors. This cannot be undone from here.
          </>
        }
        onConfirm={() =>
          noShow.mutate(
            { reasonCode: noShowReason },
            { onSuccess: () => setNoShowOpen(false) },
          )
        }
      >
        <Field label="What happened?">
          <Select
            value={noShowReason}
            onChange={(event) =>
              setNoShowReason(event.target.value as PartnerCrewNoShowReason)
            }
          >
            {PARTNER_CREW_NO_SHOW_REASONS.map((code) => (
              <option key={code} value={code}>
                {NO_SHOW_REASON_LABEL[code]}
              </option>
            ))}
          </Select>
        </Field>
      </ConfirmAction>

      {noShow.isError ? <NoShowFailure error={noShow.error} /> : null}
    </Card>
  );
}

function ReportRoute({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line px-3 py-2">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="text-sm leading-6 text-text-secondary">{detail}</p>
      {action}
    </li>
  );
}

/**
 * The safety report — `M2-FE-508`.
 *
 * Severity worst-first, because a list that reads "near miss / minor / serious /
 * critical" invites the first tap and the first tap on a severity picker is the
 * one that gets used.
 *
 * `occurred_at` is optional and left blank by default: the server stamps now,
 * and pre-filling a time is this app inventing when something happened. There is
 * **no cancellation control anywhere in this dialog**, and the consequence copy
 * says what filing does and what it does not do — a supervisor standing beside
 * an injured worker needs to know the job does not stop because they told
 * somebody.
 *
 * The report is **frozen** once filed. Operations may add a status and a
 * resolution; nobody may rewrite what was reported. Said in the dialog, because
 * it changes how carefully the description is written.
 */
function SafetyReportDialog({
  open,
  onOpenChange,
  engagementId,
  stageId,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly engagementId: string;
  readonly stageId: string;
}) {
  const report = useReportSafetyIncident(engagementId);
  const [severity, setSeverity] = useState<ShiftSafetySeverity>("SERIOUS");
  const [category, setCategory] = useState<ShiftSafetyCategory>("injury");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  const ready = description.trim() !== "";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="File a safety report"
      description="This goes to Vsolve's safety team. Nothing here cancels the job."
      dismissable={!report.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={report.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              report.mutate(
                {
                  severity,
                  categoryCode: category,
                  description,
                  occurredAt: occurredAt.trim() === "" ? null : new Date(occurredAt).toISOString(),
                  stageId,
                },
                {
                  onSuccess: () => {
                    setDescription("");
                    setOccurredAt("");
                    onOpenChange(false);
                  },
                },
              )
            }
            loading={report.isPending}
            loadingLabel="Filing"
            disabled={!ready || report.isPending}
          >
            File the report
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-6 text-text-secondary">{SAFETY_IS_NOT_A_CANCELLATION}</p>

        <Field label="How serious was it?" required>
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as ShiftSafetySeverity)}
          >
            {SHIFT_SAFETY_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {SEVERITY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What kind of thing was it?" required>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as ShiftSafetyCategory)}
          >
            {SHIFT_SAFETY_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {SAFETY_CATEGORY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="What happened?"
          description="Once this is filed nobody can change it — not you, not Vsolve. Write what you saw."
          required
        >
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={8000}
            rows={5}
          />
        </Field>

        <Field
          label="When did it happen? (optional)"
          description="Leave it blank and Vsolve records the time you filed this."
        >
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </Field>

        {report.isError ? <SafetyFailure error={report.error} /> : null}
      </div>
    </Dialog>
  );
}

/**
 * Reports already on this booking, both parties'.
 *
 * Empty is the ordinary answer and the server returns `200` for it, so nothing
 * is rendered rather than an empty-state that implies something is missing.
 */
function SafetyHistory({ engagementId }: { readonly engagementId: string }) {
  const query = useSafetyIncidents(engagementId);
  if (query.isPending || query.isError) return null;

  const incidents = query.data.incidents;
  if (incidents.length === 0) return null;

  return (
    <section aria-labelledby="safety-history" className="flex flex-col gap-2">
      <h3
        id="safety-history"
        className="text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Safety reports on this booking
      </h3>
      <ul className="flex flex-col gap-2">
        {incidents.map((incident) => (
          <li key={incident.id} className="rounded-control border border-line px-3 py-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text">
                {incident.category_code.replace(/[_-]+/g, " ")}
              </span>
              <span className="flex items-center gap-2">
                <Badge
                  tone={
                    incident.severity === "CRITICAL" || incident.severity === "SERIOUS"
                      ? "danger"
                      : "warning"
                  }
                >
                  {SEVERITY_LABEL[incident.severity]}
                </Badge>
                {incident.status === "RESOLVED" ? (
                  <Badge tone="success">Closed</Badge>
                ) : incident.status === "UNDER_REVIEW" ? (
                  <Badge tone="info">Vsolve is looking at it</Badge>
                ) : (
                  <Badge tone="neutral">Reported</Badge>
                )}
              </span>
            </span>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
              {incident.description}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {incident.reporter_role === "CUSTOMER"
                ? "Reported by the customer"
                : incident.reporter_role === "OPERATIONS"
                  ? "Reported by Vsolve"
                  : "Reported by you"}{" "}
              · {timeAgo(incident.occurred_at)}
            </p>
            {incident.resolution_note.trim() === "" ? null : (
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                What Vsolve did: {incident.resolution_note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SafetyFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}

/**
 * The refusal that is Vsolve's gap and not the vendor's.
 *
 * `m2_policy_unavailable` means the forfeit split has not been configured, so
 * the fee stays live and visible rather than being divided on an invented ratio.
 * Rendered as "we have not decided this yet", with the escalation, because a
 * retry cannot fix it and offering one would just teach the lead to keep
 * pressing.
 */
function NoShowFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isPolicyUnavailable(error)) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          title="Vsolve cannot settle this yet"
          message="We have not set how a missed first day splits between you and Vsolve, so nothing was moved rather than being split on a guess. The customer's fee is untouched and still visible. Contact support and they will settle it by hand."
          severity="warning"
          reference={presentation.reference}
        />
        <Link
          href="/contact"
          className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <LifeBuoy size={16} aria-hidden className="mr-2" />
          Contact support
        </Link>
      </div>
    );
  }

  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
