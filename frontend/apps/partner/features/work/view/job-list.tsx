"use client";

import { describeError } from "@vsolve/query";
import { Card, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { Ban, CalendarClock, CheckCircle2, ChevronRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { usePartnerJobs, type JobBucket, type PartnerVisit, type VisitStatus } from "../queries";

/**
 * Every job this Partner has, on three shelves.
 *
 * Built for someone who may not read comfortably: each shelf is a big tab, each
 * job is a card with a time, a place and one coloured status pill, and the whole
 * row is the tap target. Nothing that matters is carried by a sentence.
 *
 * The shelves are the server's buckets, not a client-side filter over eleven
 * statuses. A shelf the queue does not honour would be a lie the first time the
 * status set changed.
 */

const TABS: { bucket: JobBucket; label: string; icon: typeof Clock }[] = [
  { bucket: "active", label: "To do", icon: Clock },
  { bucket: "completed", label: "Done", icon: CheckCircle2 },
  { bucket: "cancelled", label: "Cancelled", icon: Ban },
];

/**
 * Plain wording for every published status.
 *
 * A `Record` on purpose: a status added to the contract is a `typecheck` failure
 * rather than a pill that renders `undefined`.
 */
const STATUS_COPY: Record<VisitStatus, { label: string; tone: "go" | "wait" | "done" | "stop" }> = {
  CONFIRMED: { label: "Booked", tone: "wait" },
  EN_ROUTE: { label: "On the way", tone: "go" },
  ARRIVED: { label: "Arrived", tone: "go" },
  IN_PROGRESS: { label: "Working", tone: "go" },
  COMPLETION_SUBMITTED: { label: "Waiting for customer", tone: "wait" },
  COMPLETED: { label: "Done", tone: "done" },
  PARTIALLY_COMPLETED: { label: "Part done", tone: "done" },
  DISPUTED: { label: "Customer raised a problem", tone: "stop" },
  RECOVERY_REQUIRED: { label: "Needs help", tone: "stop" },
  ABORTED: { label: "Stopped", tone: "stop" },
  CANCELLED: { label: "Cancelled", tone: "stop" },
};

const TONE_STYLES: Record<"go" | "wait" | "done" | "stop", string> = {
  go: "border-info-line bg-info-surface text-info-text",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  done: "border-success-line bg-success-surface text-success-text",
  stop: "border-critical-200 bg-critical-50 text-critical",
};

const EMPTY_COPY: Record<JobBucket, { title: string; description: string }> = {
  active: {
    title: "No jobs right now",
    description: "Go online and we will send you work as it comes in.",
  },
  completed: {
    title: "Nothing finished yet",
    description: "Jobs you complete will show up here.",
  },
  cancelled: {
    title: "Nothing cancelled",
    description: "Jobs that did not go ahead will show up here.",
  },
};

export function JobList() {
  const [bucket, setBucket] = useState<JobBucket>("active");
  const jobsQuery = usePartnerJobs(bucket);
  const jobs = jobsQuery.data ?? [];

  return (
    <div>
      <h1 className="text-lg font-bold text-text">Your jobs</h1>

      {/* Big, icon-led tabs. A tap target this size survives gloves and a
          cracked screen, which is the actual working condition. */}
      <div role="tablist" aria-label="Which jobs to show" className="mt-4 flex gap-2">
        {TABS.map((tab) => {
          const isActive = tab.bucket === bucket;
          const Icon = tab.icon;
          return (
            <button
              key={tab.bucket}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setBucket(tab.bucket)}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-control border text-sm font-semibold transition-colors ${
                isActive
                  ? "border-action bg-action text-action-text"
                  : "border-line bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Icon aria-hidden className="size-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {jobsQuery.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : jobsQuery.isError ? (
          <ErrorState
            title="We could not load your jobs"
            message={describeError(jobsQuery.error, "read").message}
            actionLabel="Try again"
            onAction={() => void jobsQuery.refetch()}
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            title={EMPTY_COPY[bucket].title}
            description={EMPTY_COPY[bucket].description}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: PartnerVisit }) {
  const status = STATUS_COPY[job.status];
  const start = new Date(job.scheduled_start);

  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-hover">
        {/* The date as a block, not a sentence — a number and a month read
            faster than "Thursday the seventh of August". */}
        <div
          aria-hidden
          className="flex size-14 shrink-0 flex-col items-center justify-center rounded-card bg-surface-sunken"
        >
          <span data-numeric className="text-lg font-bold leading-none text-text">
            {start.toLocaleDateString(undefined, { day: "numeric" })}
          </span>
          <span className="mt-0.5 text-[0.6875rem] uppercase tracking-wide text-text-secondary">
            {start.toLocaleDateString(undefined, { month: "short" })}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-text">
            <CalendarClock aria-hidden className="size-4 text-text-muted" />
            <time dateTime={job.scheduled_start}>
              {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </time>
            <span className="text-text-secondary">· {job.estimated_duration_minutes} min</span>
          </p>

          {job.work_tasks.length > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-text-secondary">
              <MapPin aria-hidden className="size-4 shrink-0" />
              {job.work_tasks.map((task) => task.label).join(", ")}
            </p>
          ) : null}

          <p
            className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_STYLES[status.tone]}`}
          >
            {status.label}
          </p>
        </div>

        <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
      </Card>
    </Link>
  );
}
