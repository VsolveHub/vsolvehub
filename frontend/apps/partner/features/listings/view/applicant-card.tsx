import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Lock,
  Mail,
  Phone,
  Unlock,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge, Card, formatDate } from "@vsolve/ui";

import { HIRING_STEP_LABELS } from "../jobs-queries";

import {
  snapshotFields,
  type ApplicationStatus,
  type PartnerApplication,
} from "../queries";

export interface ApplicantCardProps {
  app: PartnerApplication;
  onReveal: (id: string) => void;
  isRevealPending: boolean;
  onStatusChange: (params: { id: string; next: ApplicationStatus }) => void;
  isStatusPending: boolean;
  onReport: (app: PartnerApplication) => void;
  onScheduleInterview: (app: PartnerApplication) => void;
}

const STEPS = ["Applied", "Shortlisted", "Interview", "Connected"] as const;

export function ApplicantCard({
  app,
  onReveal,
  isRevealPending,
  onStatusChange,
  isStatusPending,
  onReport,
  onScheduleInterview,
}: ApplicantCardProps) {
  const step = HIRING_STEP_LABELS[app.status] ?? app.status;
  const closed = ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
  const interview = app.interview;
  const isContactRevealed = !!app.contact_revealed_at;
  const snapshot = snapshotFields(app.applicant_snapshot);

  return (
    <Card className="p-5 transition duration-fast hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={closed ? "neutral" : step === "Connected" ? "success" : "info"}>{step}</Badge>

            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Calendar className="size-3.5" />
              Applied {formatDate(app.created_at)}
            </span>

            {app.contact_revealed_at && (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" />
                Contact unlocked
              </Badge>
            )}
          </div>

          <h2 className="text-lg font-bold text-text">
            {app.applicant_name || snapshot.name || "Candidate"}
          </h2>

          {!closed ? (
            <ol className="flex flex-wrap items-center gap-1 text-[11px] font-semibold" aria-label="Hiring steps">
              {STEPS.map((name, i) => {
                const reached = STEPS.indexOf(step as (typeof STEPS)[number]) >= i;
                return (
                  <li key={name} className={`rounded-full px-2 py-0.5 ${reached ? "bg-action text-action-text" : "bg-surface-sunken text-text-muted"}`}>
                    {name}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {interview ? (
            <div className="rounded-control border border-line bg-surface p-3 text-xs">
              <p className="font-semibold text-text">
                Interview · {formatDate(`${interview.scheduled_date}T12:00:00`)} at {interview.start_time.slice(0, 5)} ·{" "}
                {interview.mode_label}
                {interview.location_text ? ` · ${interview.location_text}` : ""}
              </p>
              <p className="mt-0.5 text-text-secondary">
                {interview.status_label}
                {interview.candidate_note ? ` — “${interview.candidate_note}”` : ""}
              </p>
            </div>
          ) : null}

          {/* Every detail from the job seeker's profile */}
          {Object.keys(snapshot).some((k) => !["name", "phone", "email", "experience"].includes(k)) ? (
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {Object.entries(snapshot)
                .filter(([k, v]) => v && !["name", "phone", "email", "experience", "resume_url"].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-semibold text-text-muted">{k.replace(/_/g, " ")}: </dt>
                    <dd className="inline text-text-secondary">{v}</dd>
                  </div>
                ))}
            </dl>
          ) : null}

          {/* Candidate Details & Resume */}
          <div className="grid gap-2 rounded-control border border-line bg-surface-sunken p-3 text-xs sm:grid-cols-2 text-text-secondary">
            {snapshot.experience && (
              <div>
                <span className="font-semibold text-text-muted">Experience:</span>{" "}
                {snapshot.experience}
              </div>
            )}

            {app.resume_url || snapshot.resume_url || snapshot.portfolio_url ? (
              <div>
                <span className="font-semibold text-text-muted">Resume Link:</span>{" "}
                <a
                  href={app.resume_url || snapshot.resume_url || snapshot.portfolio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-text-link underline"
                >
                  View Profile / CV <ExternalLink className="size-3" />
                </a>
              </div>
            ) : (
              <div className="text-text-muted">No resume link provided</div>
            )}
          </div>

          {/* Cover Note */}
          {app.cover_note && (
            <div className="text-xs text-text-secondary">
              <span className="font-semibold text-text">Cover Note:</span>
              <p className="mt-1 rounded-control bg-surface-sunken p-2.5 text-text-secondary italic border border-line">
                &ldquo;{app.cover_note}&rdquo;
              </p>
            </div>
          )}

          {/* Contact Info (Masked or Revealed) */}
          <div className="flex flex-wrap items-center gap-4 rounded-control border border-line bg-surface p-3 text-xs">
            {isContactRevealed ? (
              <>
                <span className="flex items-center gap-1.5 font-semibold text-text">
                  <Phone className="size-4 text-success-text" />
                  {app.applicant_phone || "Phone provided"}
                </span>
                {app.applicant_email && (
                  <span className="flex items-center gap-1.5 font-semibold text-text">
                    <Mail className="size-4 text-text-link" />
                    {app.applicant_email}
                  </span>
                )}
                <span className="text-[11px] text-text-muted">
                  Unlocked on {formatDate(app.contact_revealed_at!)}
                </span>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-1.5 text-text-muted">
                  <Lock className="size-3.5 text-text-muted" />
                  Direct contact masked for candidate privacy.
                </span>
                <button
                  type="button"
                  onClick={() => onReveal(app.id)}
                  disabled={isRevealPending}
                  className="inline-flex items-center gap-1.5 rounded-control bg-navy-900 px-3 py-1.5 text-xs font-semibold text-warm-0 shadow-card hover:bg-navy-800 disabled:opacity-50"
                >
                  <Unlock className="size-3.5" />
                  {isRevealPending ? "Unlocking..." : "Reveal Contact"}
                </button>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          {app.status_events && app.status_events.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {app.status_events.map((ev) => (
                <span
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded-control bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted border border-line"
                >
                  <Clock className="size-3 text-text-muted" />
                  {HIRING_STEP_LABELS[ev.to_status] ?? ev.to_status} ({formatDate(ev.created_at)})
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Candidate Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
          {!closed && ["SUBMITTED", "UNDER_REVIEW"].includes(app.status) ? (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "SHORTLISTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-success-line bg-success-surface px-3 py-1.5 text-xs font-semibold text-success-text hover:bg-success-surface/80"
            >
              <UserCheck className="size-3.5" /> Shortlist
            </button>
          ) : null}

          {!closed && app.status !== "CONNECTED" ? (
            <button
              type="button"
              onClick={() => onScheduleInterview(app)}
              className="inline-flex items-center gap-1.5 rounded-control bg-action px-3 py-1.5 text-xs font-semibold text-action-text"
            >
              <Calendar className="size-3.5" /> {interview && interview.status !== "CANCELLED" ? "New interview time" : "Schedule interview"}
            </button>
          ) : null}

          {app.status === "INTERVIEW" || app.status === "CONTACTED" ? (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "CONNECTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-success-line bg-success-surface px-3 py-1.5 text-xs font-semibold text-success-text"
            >
              <CheckCircle2 className="size-3.5" /> Mark connected
            </button>
          ) : null}

          {!closed && app.status !== "CONNECTED" ? (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "REJECTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-danger-line hover:text-danger-text hover:bg-danger-surface/20"
            >
              <UserX className="size-3.5" /> Not selected
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onReport(app)}
            className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-line-strong hover:text-text"
          >
            <Flag className="size-3.5" /> Report
          </button>
        </div>
      </div>
    </Card>
  );
}
