import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  XCircle,
} from "lucide-react";

import {
  snapshotFields,
  type ListingApplication,
} from "../queries";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  SHORTLISTED: {
    label: "Shortlisted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  CONTACTED: {
    label: "Contacted",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  REJECTED: {
    label: "Not Selected",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  EXPIRED: {
    label: "Expired",
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-200",
  },
};

export interface ApplicationCardProps {
  app: ListingApplication;
  isWithdrawing: boolean;
  onStartWithdraw: () => void;
  onCancelWithdraw: () => void;
  onConfirmWithdraw: () => void;
  isPending: boolean;
}

export function ApplicationCard({
  app,
  isWithdrawing,
  onStartWithdraw,
  onCancelWithdraw,
  onConfirmWithdraw,
  isPending,
}: ApplicationCardProps) {
  const cfg = STATUS_CONFIG[app.status] || {
    label: app.status,
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  };

  const canWithdraw = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(app.status);
  const snapshot = snapshotFields(app.applicant_snapshot);

  return (
    <article className="group rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
            >
              {cfg.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              Applied on {new Date(app.created_at).toLocaleDateString()}
            </span>
            {app.contact_revealed_at ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Contact Shared with Poster
              </span>
            ) : null}
          </div>

          <h2 className="text-lg font-semibold text-slate-950">
            <Link
              href={`/listings/${app.listing}`}
              className="inline-flex items-center gap-1.5 transition hover:text-blue-600 hover:underline"
            >
              {app.listing_title || "Job Listing"}
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </h2>

          {/* Applicant Details Snapshot */}
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 text-xs text-slate-600">
            <div>
              <span className="font-medium text-slate-500">Applicant:</span>{" "}
              {app.applicant_name || snapshot.name || "N/A"}
            </div>
            {snapshot.experience ? (
              <div>
                <span className="font-medium text-slate-500">Experience:</span>{" "}
                {snapshot.experience}
              </div>
            ) : null}
            {app.resume_url ? (
              <div className="sm:col-span-2">
                <span className="font-medium text-slate-500">Resume / Profile:</span>{" "}
                <a
                  href={app.resume_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 underline"
                >
                  View Resume
                </a>
              </div>
            ) : null}
          </div>

          {app.cover_note ? (
            <div className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Cover Note:</span>
              <p className="mt-0.5 line-clamp-2 rounded bg-slate-50 p-2 text-slate-600 italic">
                &ldquo;{app.cover_note}&rdquo;
              </p>
            </div>
          ) : null}

          {/* Status events timeline if present */}
          {app.status_events && app.status_events.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              {app.status_events.map((ev) => (
                <span
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  <Clock className="h-3 w-3 text-slate-400" />
                  {ev.kind}: {ev.to_status} ({new Date(ev.created_at).toLocaleDateString()})
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {canWithdraw ? (
            isWithdrawing ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs">
                <span className="text-rose-700">Withdraw application?</span>
                <button
                  onClick={onConfirmWithdraw}
                  disabled={isPending}
                  className="rounded bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-700"
                >
                  {isPending ? "..." : "Confirm"}
                </button>
                <button
                  onClick={onCancelWithdraw}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onStartWithdraw}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              >
                <XCircle className="h-3.5 w-3.5" />
                Withdraw
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}
