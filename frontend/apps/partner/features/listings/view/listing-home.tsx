"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Card, Spinner, buttonStyles } from "@vsolve/ui";
import { ArrowRight, Briefcase, CalendarClock, Clock, Plus, UserPlus, UserRoundCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  fetchListingApplications,
  fetchListingHome,
  fetchPartnerListings,
  type PartnerApplication,
  type PartnerListing,
} from "@/features/listings/queries";

const NEW = new Set(["SUBMITTED", "UNDER_REVIEW"]);
const LIVE_INTERVIEW = new Set(["PROPOSED", "ACCEPTED", "RESCHEDULE_REQUESTED"]);
const DAY_MS = 24 * 60 * 60 * 1000;
/** Applications are read for this many open jobs, busiest first. */
const JOBS_READ = 8;

function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function interviewWhen(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const at = new Date(y!, m! - 1, d!, hh, mm);
  const day = at.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const clock = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${day}, ${clock}`;
}

function interviewTime(app: PartnerApplication): number {
  const iv = app.interview;
  if (!iv) return 0;
  return new Date(`${iv.scheduled_date}T${iv.start_time}`).getTime();
}

/**
 * Home for an employer who only posts jobs (Careers).
 *
 * No "go online": job listings never receive live offers. The home answers
 * what the employer acts on: new applicants waiting for a look, interviews
 * coming up, and how each open job is doing.
 */
export function ListingHome() {
  const [now] = useState(() => new Date());
  const summary = useQuery({ queryKey: ["partner-listings", "home"], queryFn: fetchListingHome });
  const listings = useQuery({ queryKey: ["partner-listings", "list"], queryFn: fetchPartnerListings });

  const all = ((listings.data ?? []) as PartnerListing[]).filter((l) => l.status !== "CLOSED");
  const open = all.filter((l) => l.public_state === "PUBLISHED" || l.status === "PUBLISHED");
  const withApplicants = [...open]
    .filter((l) => (l.application_count ?? 0) > 0)
    .sort((a, b) => (b.application_count ?? 0) - (a.application_count ?? 0))
    .slice(0, JOBS_READ);

  const applications = useQueries({
    queries: withApplicants.map((listing) => ({
      queryKey: ["partner-listings", "applications", listing.id],
      queryFn: () => fetchListingApplications(listing.id),
    })),
  });

  if (summary.isPending || listings.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your jobs…
      </p>
    );
  }
  const failure = summary.error ?? listings.error;
  if (failure) {
    return <p className="py-8 text-center text-sm text-danger-text">{friendlyErrorMessage(failure)}</p>;
  }

  const apps = applications.flatMap((q) => (Array.isArray(q.data) ? (q.data as PartnerApplication[]) : []));
  const toReview = apps
    .filter((a) => NEW.has(a.status ?? ""))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const interviews = apps
    .filter((a) => a.interview && LIVE_INTERVIEW.has(a.interview.status ?? "") && interviewTime(a) >= now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => interviewTime(a) - interviewTime(b));

  const withMatches = [...open]
    .filter((l) => (l.counts?.matches ?? 0) > 0)
    .sort((a, b) => (b.counts?.matches ?? 0) - (a.counts?.matches ?? 0));

  const totals = open.reduce(
    (acc, l) => ({
      views: acc.views + (l.counts?.views ?? 0),
      shortlisted: acc.shortlisted + (l.counts?.shortlisted ?? 0),
      connected: acc.connected + (l.counts?.connected ?? 0),
    }),
    { views: 0, shortlisted: 0, connected: 0 },
  );
  const h = summary.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tally label="Open jobs" value={h?.active_listings ?? open.length} icon={<Briefcase className="size-3.5" />} />
        <Tally label="New applicants" value={h?.new_applications ?? toReview.length} tone="text-action" icon={<Users className="size-3.5" />} />
        <Tally label="Shortlisted" value={totals.shortlisted} icon={<UserRoundCheck className="size-3.5" />} />
        <Tally label="Hired / connected" value={totals.connected} tone="text-success-text" hint={`${totals.views} job views`} />
      </div>

      {open.length === 0 ? (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <p className="font-bold text-navy-900">No open jobs right now</p>
          <p className="text-sm text-text-secondary">
            Post a job in a couple of minutes. Matching candidates are told straight away.
          </p>
          <Link href="/listings/post" className={buttonStyles({})}>
            <Plus className="size-4" />
            Post a job
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Group
          title="New applicants to review"
          icon={<Users className="size-4" />}
          count={toReview.length}
          empty="No new applicants waiting."
        >
          {toReview.slice(0, 5).map((a) => (
            <Row
              key={a.id}
              href={`/listings/${a.listing}`}
              title={a.applicant_name || "Applicant"}
              sub={a.listing_title}
              meta={`Applied ${ago(a.created_at, now)}`}
              action="Review"
            />
          ))}
        </Group>

        <Group
          title="Interviews coming up"
          icon={<CalendarClock className="size-4" />}
          count={interviews.length}
          empty="No interviews booked."
        >
          {interviews.slice(0, 5).map((a) => (
            <Row
              key={a.id}
              href={`/listings/${a.listing}`}
              title={a.applicant_name || "Candidate"}
              sub={`${a.listing_title} · ${a.interview?.mode_label ?? ""}`}
              meta={a.interview ? interviewWhen(a.interview.scheduled_date, a.interview.start_time) : ""}
              badge={
                a.interview?.status === "ACCEPTED" ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : a.interview?.status === "RESCHEDULE_REQUESTED" ? (
                  <Badge tone="warning">Wants another time</Badge>
                ) : (
                  <Badge tone="neutral">Waiting for reply</Badge>
                )
              }
            />
          ))}
        </Group>
      </div>

      {withMatches.length > 0 ? (
        <Group
          title="Matching candidates you can invite"
          icon={<UserPlus className="size-4" />}
          count={withMatches.reduce((sum, l) => sum + (l.counts?.matches ?? 0), 0)}
          empty=""
        >
          {withMatches.slice(0, 5).map((l) => (
            <Row
              key={l.id}
              href={`/listings/${l.id}?view=matches`}
              title={l.title}
              sub={
                summary.data?.can_see_matches
                  ? `${l.counts?.matches ?? 0} people with a strong or good match haven't applied yet`
                  : `${l.counts?.matches ?? 0} people match but haven't applied · upgrade to see and invite them`
              }
              meta=""
              badge={null}
              action={summary.data?.can_see_matches ? "See them" : "Upgrade"}
            />
          ))}
        </Group>
      ) : null}

      {open.length > 0 ? (
        <Group title="Your open jobs" icon={<Briefcase className="size-4" />} count={open.length} empty="">
          {open.slice(0, 6).map((l) => {
            const expires = l.expires_at ? new Date(l.expires_at).getTime() - now.getTime() : null;
            const soon = expires !== null && expires > 0 && expires < 3 * DAY_MS;
            return (
              <Row
                key={l.id}
                href={`/listings/${l.id}`}
                title={l.title}
                sub={`${l.counts?.applied ?? l.application_count ?? 0} applied · ${l.counts?.shortlisted ?? 0} shortlisted · ${l.counts?.interviews ?? 0} interviews`}
                meta={`${l.counts?.views ?? 0} views`}
                badge={
                  soon ? (
                    <Badge tone="warning">
                      <Clock className="size-3" /> Ends in {Math.ceil((expires ?? 0) / DAY_MS)} day
                      {Math.ceil((expires ?? 0) / DAY_MS) === 1 ? "" : "s"}
                    </Badge>
                  ) : null
                }
                action="Open"
              />
            );
          })}
        </Group>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/listings/post" className={buttonStyles({})}>
          <Plus className="size-4" />
          Post a job
        </Link>
        <Link href="/listings" className={buttonStyles({ variant: "outline" })}>
          All jobs
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card padding="none" className="px-3 py-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-text-muted">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone ?? "text-navy-900"}`}>{value}</p>
      {hint ? <p className="text-[11px] text-text-secondary">{hint}</p> : null}
    </Card>
  );
}

function Group({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{title}</h2>
        {count > 0 ? (
          <span className="rounded-full bg-action px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-action-text">
            {count}
          </span>
        ) : null}
      </div>
      {count === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-4 text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function Row({
  href,
  title,
  sub,
  meta,
  badge,
  action,
}: {
  href: string;
  title: string;
  sub: string;
  meta: string;
  badge?: ReactNode;
  action?: string;
}) {
  return (
    <li>
      <Link href={href} className="block">
        <Card padding="none" className="flex items-center gap-3 px-4 py-3 transition hover:border-line-strong">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-navy-900">{title}</p>
            <p className="truncate text-sm text-text-secondary">{sub}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {meta ? <span className="text-sm font-semibold text-navy-900">{meta}</span> : null}
              {badge}
            </div>
          </div>
          {action ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-text-link">
              {action}
              <ArrowRight className="size-3.5" />
            </span>
          ) : null}
        </Card>
      </Link>
    </li>
  );
}
