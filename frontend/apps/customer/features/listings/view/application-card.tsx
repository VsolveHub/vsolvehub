import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { Badge, Card, formatDate } from "@vsolve/ui";
import { listingHref } from "@/lib/routes";

import { formatStatusEventKind } from "../model";
import { HIRING_STEP_LABELS } from "../seeker-queries";
import { HiringProgress } from "./hiring-progress";
import {
  snapshotFields,
  type ListingApplication,
} from "../queries";

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
  const canWithdraw = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW"].includes(app.status);
  const snapshot = snapshotFields(app.applicant_snapshot);

  return (
    <Card className="group transition duration-fast hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status) ? "neutral" : "info"}>
              {HIRING_STEP_LABELS[app.status] ?? app.status}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Calendar className="size-3.5" />
              Applied on {formatDate(app.created_at)}
            </span>
            {app.contact_revealed_at ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" /> Contact Shared with Poster
              </Badge>
            ) : null}
          </div>

          <h2 className="text-lg font-bold text-text">
            <Link
              href={listingHref(app.listing_slug)}
              className="inline-flex items-center gap-1.5 transition hover:text-text-link hover:underline"
            >
              {app.listing_title || "Job Listing"}
              <ExternalLink className="size-3.5 text-text-muted" />
            </Link>
          </h2>

          {app.employer_name ? <p className="text-sm text-text-secondary">{app.employer_name}</p> : null}

          <HiringProgress app={app} />

          {/* Applicant Details Snapshot */}
          <div className="mt-3 grid gap-2 rounded-control border border-line bg-surface-sunken p-3 sm:grid-cols-2 text-xs text-text-secondary">
            <div>
              <span className="font-semibold text-text-muted">Applicant:</span>{" "}
              {app.applicant_name || snapshot.name || "N/A"}
            </div>
            {snapshot.experience ? (
              <div>
                <span className="font-semibold text-text-muted">Experience:</span>{" "}
                {snapshot.experience}
              </div>
            ) : null}
            {app.resume_url || snapshot.resume_url || snapshot.portfolio_url ? (
              <div className="sm:col-span-2">
                <span className="font-semibold text-text-muted">Resume / Profile:</span>{" "}
                <a
                  href={app.resume_url || snapshot.resume_url || snapshot.portfolio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-text-link underline"
                >
                  View Resume
                </a>
              </div>
            ) : null}
          </div>

          {app.cover_note ? (
            <div className="mt-2 text-xs text-text-secondary">
              <span className="font-semibold text-text">Cover Note:</span>
              <p className="mt-0.5 line-clamp-2 rounded-control bg-surface-sunken p-2 text-text-secondary italic border border-line">
                &ldquo;{app.cover_note}&rdquo;
              </p>
            </div>
          ) : null}

          {/* Status events timeline */}
          {app.status_events && app.status_events.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-line">
              {app.status_events.map((ev) => (
                <span
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded-control bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted border border-line"
                >
                  <Clock className="size-3 text-text-muted" />
                  {formatStatusEventKind(ev.kind)} ({formatDate(ev.created_at)})
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {canWithdraw ? (
            isWithdrawing ? (
              <div className="flex items-center gap-2 rounded-control border border-danger-line bg-danger-surface p-2 text-xs">
                <span className="text-danger-text font-semibold">Withdraw application?</span>
                <button
                  type="button"
                  onClick={onConfirmWithdraw}
                  disabled={isPending}
                  className="rounded-control bg-navy-900 px-2.5 py-1 font-semibold text-warm-0 hover:bg-navy-800 disabled:opacity-50"
                >
                  {isPending ? "..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={onCancelWithdraw}
                  className="rounded-control border border-line bg-surface px-2.5 py-1 font-semibold text-text-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onStartWithdraw}
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-semibold text-text-muted transition hover:border-danger-line hover:text-danger-text hover:bg-danger-surface/20"
              >
                <XCircle className="size-3.5" />
                Withdraw
              </button>
            )
          ) : null}
        </div>
      </div>
    </Card>
  );
}
