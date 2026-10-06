"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import { EmptyState, StatusChip } from "@vsolve/ui";

import {
  fetchListingApplications,
  fetchPartnerListingDetail,
  reportApplicantApplication,
  revealApplicationContact,
  updateApplicationStatus,
  type ApplicationStatus,
  type PartnerApplication,
} from "@/features/listings/queries";
import { friendlyErrorMessage } from "@vsolve/query";
import { useToast } from "@vsolve/ui";

import { proposeInterview } from "@/features/listings/jobs-queries";
import {
  ApplicantCard,
  InterviewDialog,
  JobMatches,
  ReportApplicantDialog,
} from "@/features/listings/view";

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

  const queryKey = ["partner-listing-applications", listingId] as const;

  const { data: applications = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchListingApplications(listingId),
  });

  const tabCounts = {
    ALL: applications.length,
    NEW: applications.filter((app) => app.status === "SUBMITTED" || app.status === "UNDER_REVIEW").length,
    SHORTLISTED: applications.filter((app) => app.status === "SHORTLISTED").length,
    INTERVIEW: applications.filter((app) => app.status === "INTERVIEW").length,
    CONNECTED: applications.filter((app) => app.status === "CONNECTED" || app.status === "CONTACTED").length,
    CLOSED: applications.filter((app) => ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status)).length,
  };

  const reveal = useMutation({
    mutationFn: revealApplicationContact,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PartnerApplication[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<PartnerApplication[]>(
          queryKey,
          previous.map((app) =>
            app.id === id ? { ...app, contact_revealed_at: new Date().toISOString() } : app,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ApplicationStatus }) =>
      updateApplicationStatus(id, next),
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PartnerApplication[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<PartnerApplication[]>(
          queryKey,
          previous.map((app) => (app.id === id ? { ...app, status: next } : app)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
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
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const interviewMutation = useMutation({
    mutationFn: (body: Parameters<typeof proposeInterview>[1]) =>
      proposeInterview(interviewing!.id, body),
    onSuccess: () => {
      setInterviewing(null);
      notify("Interview invitation sent.");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const filteredApplications = applications.filter((app) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "NEW") return app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";
    if (activeTab === "SHORTLISTED") return app.status === "SHORTLISTED";
    if (activeTab === "INTERVIEW") return app.status === "INTERVIEW";
    if (activeTab === "CONNECTED") return app.status === "CONNECTED" || app.status === "CONTACTED";
    if (activeTab === "CLOSED") return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
    return app.status === activeTab;
  });

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
              {listing?.service_name || "Role"} • {applications.length} total applicant(s) received
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
            ["applicants", `Applications (${applications.length})`],
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
          const count = tabCounts[tab.key as keyof typeof tabCounts] ?? 0;
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
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === tab.key
                    ? "bg-warm-0/20 text-warm-0"
                    : "bg-surface-sunken text-text-muted"
                }`}
              >
                {count}
              </span>
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
