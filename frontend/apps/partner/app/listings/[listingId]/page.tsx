"use client";

import Link from "next/link";
import { useState } from "react";
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
import { ApplicantCard, ReportApplicantDialog } from "@/features/listings/view";

const FILTER_TABS = [
  { key: "ALL", label: "All Applicants" },
  { key: "NEW", label: "New / In Review" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "CLOSED", label: "Closed / Withdrawn" },
];

export default function PartnerListingLeadsPage() {
  const params = useParams<{ listingId: string }>();
  const queryClient = useQueryClient();
  const listingId = params.listingId;
  const [activeTab, setActiveTab] = useState<string>("ALL");

  const { data: listing } = useQuery({
    queryKey: ["partner-listing-detail", listingId],
    queryFn: () => fetchPartnerListingDetail(listingId),
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["partner-listing-applications", listingId],
    queryFn: () => fetchListingApplications(listingId),
  });

  const reveal = useMutation({
    mutationFn: revealApplicationContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-listing-applications", listingId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ApplicationStatus }) =>
      updateApplicationStatus(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-listing-applications", listingId] });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
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
      queryClient.invalidateQueries({ queryKey: ["partner-listing-applications", listingId] });
    },
  });

  const filteredApplications = applications.filter((app) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "NEW") return app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";
    if (activeTab === "SHORTLISTED") return app.status === "SHORTLISTED";
    if (activeTab === "CONTACTED") return app.status === "CONTACTED";
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

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {FILTER_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-navy-900 text-warm-0 shadow-xs"
                : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
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
            onReport={(target) => {
              setReportingApp(target);
              setReportReason("SPAM");
              setReportDetail("");
            }}
          />
        ))}
      </div>

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
