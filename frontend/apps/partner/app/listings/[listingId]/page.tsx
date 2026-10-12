"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import { EmptyState, LoadMore, StatusChip } from "@vsolve/ui";

import {
  fetchListingApplicationsPage,
  fetchPartnerListingDetail,
  reportApplicantApplication,
  revealApplicationContact,
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
  CONNECTED: "CONNECTED,CONTACTED",
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

const FILTER_TABS = [
  { key: "ALL", label: "All Applicants" },
  { key: "NEW", label: "New / In Review" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "CONNECTED", label: "Connected" },
  { key: "CLOSED", label: "Closed / Withdrawn" },
];

export default function PartnerListingLeadsPage() {
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
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
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
      if (!reportingApp) throw new Error("No applicant selected for report");
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
      notify("Interview invitation sent.");
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-text"
        >
          <ArrowLeft className="size-4" /> Back to Listings Workspace
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">
              {listing?.title || "Listing Applicant Leads"}
            </h1>
            <p className="mt-0.5 text-xs text-text-muted">
              {listing?.service_name || "Role"} • {totalApplicants} total applicant(s) received
            </p>
          </div>
          {listing?.status && (
            <StatusChip status={listing.status} category="listing" />
          )}
        </div>
      </div>

      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-control border border-line bg-surface-sunken p-1 sm:max-w-sm">
        {(
          [
            ["applicants", `Applications (${totalApplicants})`],
            ["matches", "Matching candidates"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold ${view === key ? "bg-surface text-navy-900 shadow-xs" : "text-text-secondary"}`}
          >
            {label}
          </button>
        ))}
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
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "ALL" ? totalApplicants : activeTab === tab.key ? loadedCount : null;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.key
                  ? "bg-navy-900 text-warm-0 shadow-xs"
                  : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover"
              }`}
            >
              <span>{tab.label}</span>
              {count === null ? null : (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-warm-0/20 text-warm-0"
                      : "bg-surface-sunken text-text-muted"
                  }`}
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
          <span className="ml-2 text-sm">Loading applicants...</span>
        </div>
      ) : null}

      {!isLoading && filteredApplications.length === 0 ? (
        <EmptyState
          title="No applicants in this view"
          description={
            activeTab === "ALL"
              ? "Candidates who apply will appear here directly."
              : "No candidates match the selected filter."
          }
        />
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
        label="Show more applicants"
      />

      </>
      )}

      <InterviewDialog
        open={interviewing !== null}
        candidateName={
          interviewing?.applicant_name ||
          String((interviewing?.applicant_snapshot as Record<string, unknown> | undefined)?.name ?? "the candidate")
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
