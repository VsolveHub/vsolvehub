"use client";

import { Card, Skeleton } from "@vsolve/ui";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";

import { usePartnerJobs, type PartnerVisit } from "../queries";

/**
 * What this Partner has to do today, on the home screen.
 *
 * The home screen previously showed only presence and the offer inbox, which
 * answers "is there new work?" but not "what have I already agreed to?". A
 * Partner who accepted a job yesterday had nowhere to see it without hunting for
 * a URL, because there was no job list to hunt in.
 *
 * Today only. A full list is one tap away and lives on `/jobs`; putting every
 * future job here would bury the one thing that is happening in the next few
 * hours.
 *
 * Renders nothing when today is empty — the offer inbox below is then the honest
 * next thing to look at, and an empty box above it is just furniture.
 */
export function TodayStrip() {
  const jobsQuery = usePartnerJobs("active");

  if (jobsQuery.isPending) return <Skeleton className="h-24 w-full" />;
  if (jobsQuery.isError) return null;

  const today = (jobsQuery.data ?? []).filter(isToday);
  if (today.length === 0) return null;

  return (
    <section aria-labelledby="today-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-heading" className="text-base font-bold text-text">
          Today
        </h2>
        <Link
          href="/jobs"
          className="text-sm font-semibold text-text-link underline-offset-4 hover:underline"
        >
          All jobs
        </Link>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {today.map((job) => (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`} className="block">
              <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-hover">
                <CalendarClock aria-hidden className="size-5 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p data-numeric className="font-semibold text-text">
                    <time dateTime={job.scheduled_start}>
                      {new Date(job.scheduled_start).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </p>
                  {job.work_tasks.length > 0 ? (
                    <p className="truncate text-sm text-text-secondary">
                      {job.work_tasks.map((task) => task.label).join(", ")}
                    </p>
                  ) : null}
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function isToday(job: PartnerVisit): boolean {
  const start = new Date(job.scheduled_start);
  const now = new Date();
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}
