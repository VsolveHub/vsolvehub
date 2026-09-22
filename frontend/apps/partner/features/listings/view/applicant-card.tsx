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

import {
  snapshotFields,
  type ApplicationStatus,
  type PartnerApplication,
} from "../queries";

const APPLICATION_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  SUBMITTED: { label: "New Application", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  UNDER_REVIEW: { label: "Under Review", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  SHORTLISTED: { label: "Shortlisted", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  CONTACTED: { label: "Contacted", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  REJECTED: { label: "Rejected", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  WITHDRAWN: { label: "Candidate Withdrew", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  EXPIRED: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

export interface ApplicantCardProps {
  app: PartnerApplication;
  onReveal: (id: string) => void;
  isRevealPending: boolean;
  onStatusChange: (params: { id: string; next: ApplicationStatus }) => void;
  isStatusPending: boolean;
  onReport: (app: PartnerApplication) => void;
}

export function ApplicantCard({
  app,
  onReveal,
  isRevealPending,
  onStatusChange,
  isStatusPending,
  onReport,
}: ApplicantCardProps) {
  const cfg = APPLICATION_STATUS_CONFIG[app.status] || {
    label: app.status,
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  };

  const isContactRevealed = !!app.contact_revealed_at;
  const snapshot = snapshotFields(app.applicant_snapshot);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-slate-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
            >
              {cfg.label}
            </span>

            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              Applied {new Date(app.created_at).toLocaleDateString()}
            </span>

            {app.contact_revealed_at && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Contact unlocked
              </span>
            )}
          </div>

          <h2 className="text-lg font-bold text-slate-950">
            {app.applicant_name || snapshot.name || "Candidate"}
          </h2>

          <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs sm:grid-cols-2 text-slate-700">
            {snapshot.experience && (
              <div>
                <span className="font-semibold text-slate-500">Experience:</span>{" "}
                {snapshot.experience}
              </div>
            )}

            {app.resume_url ? (
              <div>
                <span className="font-semibold text-slate-500">Resume Link:</span>{" "}
                <a
                  href={app.resume_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 underline"
                >
                  View Profile / CV <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <div className="text-slate-400">No resume link provided</div>
            )}
          </div>

          {app.cover_note && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Cover Note:</span>
              <p className="mt-1 rounded-md bg-slate-50 p-2.5 text-slate-700 italic border border-slate-100">
                &ldquo;{app.cover_note}&rdquo;
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-100 bg-white p-3 text-xs">
            {isContactRevealed ? (
              <>
                <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Phone className="h-4 w-4 text-emerald-600" />
                  {app.applicant_phone || "Phone provided"}
                </span>
                {app.applicant_email && (
                  <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <Mail className="h-4 w-4 text-indigo-600" />
                    {app.applicant_email}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  Unlocked on {new Date(app.contact_revealed_at!).toLocaleDateString()}
                </span>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Direct contact masked for candidate privacy.
                </span>
                <button
                  type="button"
                  onClick={() => onReveal(app.id)}
                  disabled={isRevealPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  {isRevealPending ? "Unlocking..." : "Reveal Contact"}
                </button>
              </div>
            )}
          </div>

          {app.status_events && app.status_events.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {app.status_events.map((ev) => (
                <span
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                >
                  <Clock className="h-3 w-3 text-slate-400" />
                  {ev.kind}: {ev.to_status} ({new Date(ev.created_at).toLocaleDateString()})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
          {app.status !== "SHORTLISTED" && app.status !== "REJECTED" && (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "SHORTLISTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <UserCheck className="h-3.5 w-3.5" /> Shortlist
            </button>
          )}

          {app.status !== "CONTACTED" && app.status !== "REJECTED" && (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "CONTACTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100"
            >
              <Phone className="h-3.5 w-3.5" /> Mark Contacted
            </button>
          )}

          {app.status !== "REJECTED" && (
            <button
              type="button"
              onClick={() => onStatusChange({ id: app.id, next: "REJECTED" })}
              disabled={isStatusPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
            >
              <UserX className="h-3.5 w-3.5" /> Reject
            </button>
          )}

          <button
            type="button"
            onClick={() => onReport(app)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
          >
            <Flag className="h-3.5 w-3.5" /> Report
          </button>
        </div>
      </div>
    </article>
  );
}
