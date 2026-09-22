"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, User } from "lucide-react";

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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Listings Workspace
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              {listing?.title || "Listing Applicant Leads"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {listing?.service_name || "Role"} • {applications.length} total applicant(s) received
            </p>
          </div>
          {listing?.status && (
            <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Listing Status: {listing.status}
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action mutation errors */}
      {(reveal.error || statusMutation.error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {(reveal.error as Error)?.message || (statusMutation.error as Error)?.message}
        </div>
      )}

      {/* Loading & Empty States */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Clock className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm">Loading applicants...</span>
        </div>
      ) : null}

      {!isLoading && filteredApplications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-16 text-center">
          <User className="h-12 w-12 text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-950">No applicants in this view</h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === "ALL"
              ? "Candidates who apply will appear here directly."
              : "No candidates match the selected filter."}
          </p>
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
