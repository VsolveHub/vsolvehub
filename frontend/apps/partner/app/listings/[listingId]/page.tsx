"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  Banknote,
  Briefcase,
  CalendarClock,
  Clock,
  Eye,
  MapPin,
  Pencil,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { Card, LoadMore, StatusChip, cn, useT } from "@vsolve/ui";

import {
  fetchListingApplicationsPage,
  fetchPartnerListingDetail,
  reportApplicantApplication,
  revealApplicationContact,
  runListingAction,
  updateApplicationStatus,
  type ApplicationStatus,
  type PartnerApplication,
} from "@/features/listings/queries";
import { friendlyErrorMessage, usePagedList, type Page } from "@vsolve/query";
import { useToast } from "@vsolve/ui";

import { proposeInterview } from "@/features/listings/jobs-queries";
import {
  ApplicantCard,
  InterviewDialog,
  JobMatches,
  ReportApplicantDialog,
} from "@/features/listings/view";

/** Each tab as the application states the server filters on. */
const TAB_STATUSES: Record<string, string> = {
  ALL: "",
  NEW: "SUBMITTED,UNDER_REVIEW",
  SHORTLISTED: "SHORTLISTED",
  INTERVIEW: "INTERVIEW",
  CONNECTED: "CONNECTED,CONTACTED,HIRED",
  CLOSED: "REJECTED,WITHDRAWN,EXPIRED",
};

type ApplicationPages = InfiniteData<Page<PartnerApplication>>;

/** Change one applicant wherever it sits in the loaded pages (optimistic update). */
function patchApplication(
  data: ApplicationPages | undefined,
  id: string,
  patch: Partial<PartnerApplication>,
): ApplicationPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      results: page.results.map((app) => (app.id === id ? { ...app, ...patch } : app)),
    })),
  };
}

const FILTER_TAB_KEYS: Record<string, string> = {
  ALL: "listings.detail.filter.all",
  NEW: "listings.detail.filter.new",
  SHORTLISTED: "listings.detail.filter.shortlisted",
  INTERVIEW: "listings.detail.filter.interview",
  CONNECTED: "listings.detail.filter.connected",
  CLOSED: "listings.detail.filter.closed",
};
const FILTER_TABS = ["ALL", "NEW", "SHORTLISTED", "INTERVIEW", "CONNECTED", "CLOSED"];

export default function PartnerListingLeadsPage() {
  const t = useT();
  const params = useParams<{ listingId: string }>();
  const queryClient = useQueryClient();
  const listingId = params.listingId;
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [view, setView] = useState<"applicants" | "matches">("applicants");
  // `?view=matches` (from the job card and home) opens straight on matching candidates.
  // Read after mount: `useSearchParams` would force a Suspense boundary on this route.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "matches") setView("matches");
  }, []);
  const [interviewing, setInterviewing] = useState<PartnerApplication | null>(null);
  const { notify } = useToast();

  const { data: listing } = useQuery({
    queryKey: ["partner-listing-detail", listingId],
    queryFn: () => fetchPartnerListingDetail(listingId),
  });

  const baseKey = ["partner-listing-applications", listingId] as const;
  const statuses = TAB_STATUSES[activeTab] ?? "";
  const queryKey = [...baseKey, statuses] as const;

  const applicationsList = usePagedList(queryKey, (cursor) =>
    fetchListingApplicationsPage(listingId, cursor, statuses || undefined),
  );
  const applications = applicationsList.items;
  const { isLoading } = applicationsList;
  // The job carries its own total; the open tab shows what has loaded, "+" while more remain.
  const totalApplicants = listing?.application_count ?? applications.length;
  const loadedCount = `${applications.length}${applicationsList.hasMore ? "+" : ""}`;

  const reveal = useMutation({
    mutationFn: revealApplicationContact,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ApplicationPages>(queryKey);
      queryClient.setQueryData<ApplicationPages>(
        queryKey,
        patchApplication(previous, id, { contact_revealed_at: new Date().toISOString() }),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ApplicationStatus }) =>
      updateApplicationStatus(id, next),
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ApplicationPages>(queryKey);
      queryClient.setQueryData<ApplicationPages>(
        queryKey,
        patchApplication(previous, id, { status: next }),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      notify(friendlyErrorMessage(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baseKey });
      // The job's hired count decides whether "close as filled" is offered.
      queryClient.invalidateQueries({ queryKey: ["partner-listing-detail", listingId] });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    },
  });

  // Hired for every vacancy: offer to close the job as filled (the server turns down the rest).
  const hiredCount = listing?.counts?.hired ?? 0;
  const offerFill =
    listing?.status === "PUBLISHED" && hiredCount > 0 && hiredCount >= (listing.vacancies ?? 1);
  const fillMutation = useMutation({
    mutationFn: () => runListingAction(listingId, "fill"),
    onSuccess: () => notify(t("listings.fill.done")),
    onError: (err) => notify(friendlyErrorMessage(err)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-listing-detail", listingId] });
      queryClient.invalidateQueries({ queryKey: baseKey });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    },
  });

  const [reportingApp, setReportingApp] = useState<PartnerApplication | null>(null);
  const [reportReason, setReportReason] = useState<string>("SPAM");
  const [reportDetail, setReportDetail] = useState<string>("");

  const reportMutation = useMutation({
    mutationFn: () => {
      if (!reportingApp) throw new Error(t("listings.detail.noApplicantSelected"));
      return reportApplicantApplication(reportingApp.id, reportReason, reportDetail);
    },
    onSuccess: () => {
      setReportingApp(null);
      setReportDetail("");
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
  });

  const interviewMutation = useMutation({
    mutationFn: (body: Parameters<typeof proposeInterview>[1]) =>
      proposeInterview(interviewing!.id, body),
    onSuccess: () => {
      setInterviewing(null);
      notify(t("listings.detail.interviewInvitationSent"));
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
  });

  const filteredApplications = applications;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* Top Breadcrumb */}
      <div>
        <Link
          href="/listings"
          className="group inline-flex items-center gap-2 text-xs font-medium text-text-muted transition hover:text-text"
        >
          <span className="grid size-6 place-items-center rounded-full border border-line bg-surface text-text-secondary transition group-hover:border-navy-900 group-hover:text-text">
            <ArrowLeft className="size-3.5" />
          </span>
          <span>{t("listings.detail.backToWorkspace")}</span>
        </Link>
      </div>

      {/* Hero Header Card */}
      <Card padding="none" className="overflow-hidden border border-line bg-surface">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
                  {listing?.title || t("listings.detail.titleFallback")}
                </h1>
                {listing?.status && (
                  <StatusChip status={listing.status} category="listing" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Briefcase className="size-3.5 text-text-muted" />
                  {listing?.service_name || t("listings.detail.roleFallback")}
                </span>
                {listing?.location_text && (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <MapPin className="size-3.5 text-text-muted" />
                    {listing.location_text}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Users className="size-3.5 text-text-muted" />
                  {listing?.vacancies ?? 1} {listing?.vacancies === 1 ? "opening" : "openings"}
                </span>
                {listing?.salary_display && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-surface border border-success-line px-2.5 py-0.5 font-semibold text-success-text">
                    <Banknote className="size-3.5" />
                    {listing.salary_display}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/listings/post?edit=${listingId}`}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-bold text-text transition hover:border-line-strong hover:bg-surface-hover"
              >
                <Pencil className="size-3.5 text-text-muted" />
                <span>Edit Job</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Metrics Strip */}
        <div className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 sm:grid-cols-5 border-t border-line bg-surface-sunken/40 text-center">
          <div className="p-3 sm:py-3.5">
            <span className="flex items-center justify-center gap-1 text-[11px] font-medium text-text-muted">
              <Users className="size-3.5" />
              Applied
            </span>
            <p className="mt-1 text-xl font-bold text-text">{totalApplicants}</p>
          </div>
          <div className="p-3 sm:py-3.5">
            <span className="flex items-center justify-center gap-1 text-[11px] font-medium text-text-muted">
              <UserCheck className="size-3.5" />
              Shortlisted
            </span>
            <p className="mt-1 text-xl font-bold text-text">{listing?.counts?.shortlisted ?? 0}</p>
          </div>
          <div className="p-3 sm:py-3.5">
            <span className="flex items-center justify-center gap-1 text-[11px] font-medium text-text-muted">
              <CalendarClock className="size-3.5" />
              Interviews
            </span>
            <p className="mt-1 text-xl font-bold text-text">{listing?.counts?.interviews ?? 0}</p>
          </div>
          <div className="p-3 sm:py-3.5">
            <span className="flex items-center justify-center gap-1 text-[11px] font-medium text-text-muted">
              <Award className="size-3.5" />
              Hired
            </span>
            <p className="mt-1 text-xl font-bold text-success-text">{hiredCount}</p>
          </div>
          <div className="p-3 sm:py-3.5 col-span-2 sm:col-span-1 border-t sm:border-t-0">
            <span className="flex items-center justify-center gap-1 text-[11px] font-medium text-text-muted">
              <Eye className="size-3.5" />
              Views
            </span>
            <p className="mt-1 text-xl font-bold text-text">{listing?.counts?.views ?? 0}</p>
          </div>
        </div>
      </Card>

      {offerFill ? (
        <section
          aria-labelledby="fill-title"
          className="flex flex-col gap-3 rounded-card border border-success-line bg-success-surface p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="fill-title" className="text-sm font-bold text-text">
              {t("listings.fill.title")}
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">{t("listings.fill.body")}</p>
          </div>
          <button
            type="button"
            onClick={() => fillMutation.mutate()}
            disabled={fillMutation.isPending}
            className="shrink-0 rounded-control bg-success-text px-4 py-2 text-sm font-bold text-surface hover:opacity-90 disabled:opacity-60"
          >
            {t("listings.fill.confirm")}
          </button>
        </section>
      ) : null}

      {/* View Switcher: Applications vs Matching Candidates */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div role="tablist" className="inline-flex items-center rounded-xl border border-line bg-surface-sunken p-1">
          {(
            [
              ["applicants", t("listings.detail.applicationsTab", { count: totalApplicants })],
              ["matches", t("listings.detail.matchingCandidatesTab")],
            ] as const
          ).map(([key, label]) => {
            const isMatches = key === "matches";
            const matchCount = listing?.counts?.matches ?? 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition",
                  view === key
                    ? "bg-surface text-text shadow-sm"
                    : "text-text-secondary hover:text-text"
                )}
              >
                {isMatches ? (
                  <Sparkles className="size-4 text-warning-text" />
                ) : (
                  <Users className="size-4 text-action" />
                )}
                <span>{label}</span>
                {isMatches && matchCount > 0 && (
                  <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-bold text-warning-text">
                    {matchCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {view === "matches" ? (
        <JobMatches
          listingId={listingId}
          hiddenMatchCount={listing?.counts?.matches ?? 0}
          onOpenApplications={() => setView("applicants")}
        />
      ) : (
      <>
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tabKey) => {
          const count =
            tabKey === "ALL" ? totalApplicants : activeTab === tabKey ? loadedCount : null;
          const isActive = activeTab === tabKey;
          return (
            <button
              type="button"
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                isActive
                  ? "bg-navy-900 text-white shadow-sm ring-2 ring-navy-900/15"
                  : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover hover:text-text"
              )}
            >
              <span>{t(FILTER_TAB_KEYS[tabKey]!)}</span>
              {count !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    isActive ? "bg-white/20 text-white" : "bg-surface-sunken text-text-muted"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action mutation errors */}
      {(reveal.error || statusMutation.error) && (
        <div className="rounded-control border border-danger-line bg-danger-surface p-3 text-xs text-danger-text">
          {(reveal.error as Error)?.message || (statusMutation.error as Error)?.message}
        </div>
      )}

      {/* Loading & Empty States */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Clock className="size-6 animate-spin text-text-muted" />
          <span className="ml-2 text-sm">{t("listings.detail.loadingApplicants")}</span>
        </div>
      ) : null}

      {!isLoading && filteredApplications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-signal-100 bg-signal-50 text-action">
            <Users className="size-7" />
          </div>
          <h3 className="text-base font-bold text-text">
            {t("listings.detail.emptyTitle")}
          </h3>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-text-secondary">
            {activeTab === "ALL"
              ? t("listings.detail.emptyAll")
              : t("listings.detail.emptyFiltered")}
          </p>
          {/* Already inside the applicants view, so there is no need to ask which view is open. */}
          {listing?.counts?.matches && listing.counts.matches > 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold text-text-muted">
                Don&apos;t wait for applicants to apply:
              </p>
              <button
                type="button"
                onClick={() => setView("matches")}
                className="inline-flex items-center gap-2 rounded-full bg-action px-5 py-2.5 text-xs font-semibold text-action-text transition hover:bg-action-hover"
              >
                <Sparkles className="size-4" />
                <span>Invite {listing.counts.matches} matching candidate{listing.counts.matches === 1 ? "" : "s"}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Application Cards */}
      <div className="grid gap-4">
        {filteredApplications.map((app: PartnerApplication) => (
          <ApplicantCard
            key={app.id}
            app={app}
            onReveal={(id) => reveal.mutate(id)}
            isRevealPending={reveal.isPending}
            onStatusChange={(params) => statusMutation.mutate(params)}
            isStatusPending={statusMutation.isPending}
            onScheduleInterview={(target) => {
              interviewMutation.reset();
              setInterviewing(target);
            }}
            onReport={(target) => {
              setReportingApp(target);
              setReportReason("SPAM");
              setReportDetail("");
            }}
          />
        ))}
      </div>
      <LoadMore
        hasMore={applicationsList.hasMore}
        loading={applicationsList.loadingMore}
        onLoadMore={applicationsList.loadMore}
        label={t("listings.detail.showMoreApplicants")}
      />

      </>
      )}

      <InterviewDialog
        open={interviewing !== null}
        candidateName={
          interviewing?.applicant_name ||
          String((interviewing?.applicant_snapshot as Record<string, unknown> | undefined)?.name ?? t("listings.detail.candidateFallback"))
        }
        defaultLocation={listing?.location_text ?? ""}
        isPending={interviewMutation.isPending}
        error={interviewMutation.error ? friendlyErrorMessage(interviewMutation.error) : null}
        onClose={() => setInterviewing(null)}
        onSubmit={(body) => interviewMutation.mutate(body)}
      />

      {/* Report Candidate Abuse Modal */}
      <ReportApplicantDialog
        app={reportingApp}
        onClose={() => setReportingApp(null)}
        reason={reportReason}
        onReasonChange={setReportReason}
        detail={reportDetail}
        onDetailChange={setReportDetail}
        onSubmit={() => reportMutation.mutate()}
        isPending={reportMutation.isPending}
        error={reportMutation.error ? (reportMutation.error as Error).message : undefined}
      />
    </main>
  );
}
