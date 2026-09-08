"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Lock,
  Mail,
  Phone,
  Unlock,
  User,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";

import {
  fetchListingApplications,
  fetchPartnerListingDetail,
  PartnerApplication,
  reportApplicantApplication,
  revealApplicationContact,
  updateApplicationStatus,
} from "@/features/listings/queries";

const APPLICATION_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  SUBMITTED: { label: "New Application", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  UNDER_REVIEW: { label: "Under Review", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  SHORTLISTED: { label: "Shortlisted", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  CONTACTED: { label: "Contacted", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  HIRED: { label: "Hired", bg: "bg-green-50", text: "text-green-800", border: "border-green-200" },
  REJECTED: { label: "Rejected", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  WITHDRAWN: { label: "Candidate Withdrew", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  EXPIRED: { label: "Expired", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

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
    mutationFn: ({ id, next }: { id: string; next: string }) => updateApplicationStatus(id, next),
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
    if (activeTab === "HIRED") return app.status === "HIRED";
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
        {[
          { key: "ALL", label: "All Applicants" },
          { key: "NEW", label: "New / In Review" },
          { key: "SHORTLISTED", label: "Shortlisted" },
          { key: "CONTACTED", label: "Contacted" },
          { key: "HIRED", label: "Hired" },
          { key: "CLOSED", label: "Closed / Withdrawn" },
        ].map((tab) => (
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
          <h3 className="mt-3 text-base font-semibold text-slate-900">No applicants in this view</h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === "ALL"
              ? "Candidates who apply will appear here directly."
              : "No candidates match the selected filter."}
          </p>
        </div>
      ) : null}

      {/* Application Cards */}
      <div className="grid gap-4">
        {filteredApplications.map((app: PartnerApplication) => {
          const cfg = APPLICATION_STATUS_CONFIG[app.status] || {
            label: app.status,
            bg: "bg-slate-100",
            text: "text-slate-700",
            border: "border-slate-200",
          };

          const isContactRevealed = !!app.contact_revealed_at;

          return (
            <article
              key={app.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-slate-300"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      {cfg.label}
                    </span>

                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </span>

                    {app.contact_revealed_at && (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Contact unlocked
                      </span>
                    )}
                  </div>

                  <h2 className="text-lg font-bold text-slate-950">
                    {app.applicant_name || app.applicant_snapshot?.name || "Candidate"}
                  </h2>

                  {/* Candidate Details & Resume */}
                  <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs sm:grid-cols-2 text-slate-700">
                    {app.applicant_snapshot?.experience && (
                      <div>
                        <span className="font-semibold text-slate-500">Experience:</span>{" "}
                        {app.applicant_snapshot.experience}
                      </div>
                    )}

                    {app.resume_url ? (
                      <div>
                        <span className="font-semibold text-slate-500">Resume Link:</span>{" "}
                        <a
                          href={app.resume_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 underline"
                        >
                          View Profile / CV <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-slate-400">No resume link provided</div>
                    )}
                  </div>

                  {/* Cover Note */}
                  {app.cover_note && (
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Cover Note:</span>
                      <p className="mt-1 rounded-md bg-slate-50 p-2.5 text-slate-700 italic border border-slate-100">
                        &ldquo;{app.cover_note}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Contact Info (Masked or Revealed) */}
                  <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-100 bg-white p-3 text-xs">
                    {isContactRevealed ? (
                      <>
                        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Phone className="h-4 w-4 text-emerald-600" />
                          {app.applicant_phone || "Phone provided"}
                        </span>
                        {app.applicant_email && (
                          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Mail className="h-4 w-4 text-indigo-600" />
                            {app.applicant_email}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          Unlocked on {new Date(app.contact_revealed_at!).toLocaleDateString()}
                        </span>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          Direct contact masked for candidate privacy.
                        </span>
                        <button
                          onClick={() => reveal.mutate(app.id)}
                          disabled={reveal.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          {reveal.isPending ? "Unlocking..." : "Reveal Contact"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status Timeline */}
                  {app.status_events && app.status_events.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {app.status_events.map((ev) => (
                        <span
                          key={ev.id}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                        >
                          <Clock className="h-3 w-3 text-slate-400" />
                          {ev.kind}: {ev.to_status} ({new Date(ev.created_at).toLocaleDateString()})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Candidate Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
                  {app.status !== "SHORTLISTED" && app.status !== "HIRED" && app.status !== "REJECTED" && (
                    <button
                      onClick={() => statusMutation.mutate({ id: app.id, next: "SHORTLISTED" })}
                      disabled={statusMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Shortlist
                    </button>
                  )}

                  {app.status !== "CONTACTED" && app.status !== "HIRED" && app.status !== "REJECTED" && (
                    <button
                      onClick={() => statusMutation.mutate({ id: app.id, next: "CONTACTED" })}
                      disabled={statusMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                    >
                      <Phone className="h-3.5 w-3.5" /> Mark Contacted
                    </button>
                  )}

                  {app.status !== "HIRED" && app.status !== "REJECTED" && (
                    <button
                      onClick={() => statusMutation.mutate({ id: app.id, next: "HIRED" })}
                      disabled={statusMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Mark Hired
                    </button>
                  )}

                  {app.status !== "REJECTED" && app.status !== "HIRED" && (
                    <button
                      onClick={() => statusMutation.mutate({ id: app.id, next: "REJECTED" })}
                      disabled={statusMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                    >
                      <UserX className="h-3.5 w-3.5" /> Reject
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setReportingApp(app);
                      setReportReason("SPAM");
                      setReportDetail("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                  >
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Report Candidate Abuse Modal */}
      {reportingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-slate-950">Report Candidate</h3>
              </div>
              <button
                onClick={() => setReportingApp(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                reportMutation.mutate();
              }}
            >
              <p className="text-xs text-slate-600">
                Reporting candidate{" "}
                <strong>
                  {reportingApp.applicant_name ||
                    reportingApp.applicant_snapshot?.name ||
                    "Candidate"}
                </strong>
                . This logs an abuse case for the trust & safety team to review.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
                >
                  <option value="SPAM">Spam / Bot submission</option>
                  <option value="FRAUD">Fraudulent information or fake resume</option>
                  <option value="HARASSMENT">Harassment or inappropriate message</option>
                  <option value="OTHER">Other violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Additional Details
                </label>
                <textarea
                  rows={3}
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="Explain why this candidate submission violates policy..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              {reportMutation.error && (
                <p className="text-xs text-rose-600">{(reportMutation.error as Error).message}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportingApp(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reportMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {reportMutation.isPending ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
