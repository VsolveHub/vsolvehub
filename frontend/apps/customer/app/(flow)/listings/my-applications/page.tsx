"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  User,
  XCircle,
} from "lucide-react";

import {
  fetchMyApplications,
  snapshotFields,
  withdrawApplication,
  type ListingApplication,
} from "@/features/listings/queries";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  SHORTLISTED: {
    label: "Shortlisted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  CONTACTED: {
    label: "Contacted",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  HIRED: {
    label: "Hired",
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-200",
  },
  REJECTED: {
    label: "Not Selected",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  EXPIRED: {
    label: "Expired",
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-200",
  },
};

export default function MyApplicationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const { data: applications = [], isLoading, error } = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
  });

  const withdraw = useMutation({
    mutationFn: (applicationId: string) => withdrawApplication(applicationId),
    onSuccess: () => {
      setWithdrawingId(null);
      queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: () => {
      setWithdrawingId(null);
    },
  });

  const filteredApplications = applications.filter((app) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE")
      return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "CONTACTED"].includes(app.status);
    if (activeTab === "CLOSED")
      return ["HIRED", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
    return app.status === activeTab;
  });

  const canWithdraw = (status: string) =>
    ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(status);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/listings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Job Listings
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            My Job Applications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track, monitor, and manage all your career applications in one place.
          </p>
        </div>
        <Link
          href="/listings"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          <BriefcaseBusiness className="h-4 w-4" /> Browse Opportunities
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { key: "ALL", label: "All Applications" },
          { key: "ACTIVE", label: "In Progress" },
          { key: "SHORTLISTED", label: "Shortlisted" },
          { key: "CLOSED", label: "Completed / Closed" },
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

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Clock className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm">Loading applications...</span>
        </div>
      ) : null}

      {!isLoading && filteredApplications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <FileText className="h-12 w-12 text-slate-300" />
          <h3 className="mt-3 text-base font-medium text-slate-900">No applications found</h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === "ALL"
              ? "You have not applied to any job listings yet."
              : "No applications match the selected filter."}
          </p>
          <Link
            href="/listings"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Explore Open Listings
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4">
        {filteredApplications.map((app: ListingApplication) => {
          const cfg = STATUS_CONFIG[app.status] || {
            label: app.status,
            bg: "bg-slate-100",
            text: "text-slate-700",
            border: "border-slate-200",
          };

          return (
            <article
              key={app.id}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      Applied on {new Date(app.created_at).toLocaleDateString()}
                    </span>
                    {app.contact_revealed_at ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Contact Shared with Poster
                      </span>
                    ) : null}
                  </div>

                  <h2 className="text-lg font-semibold text-slate-950">
                    <Link
                      href={`/listings/${app.listing}`}
                      className="inline-flex items-center gap-1.5 transition hover:text-blue-600 hover:underline"
                    >
                      {app.listing_title || "Job Listing"}
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </h2>

                  {/* Applicant Details Snapshot */}
                  <div className="mt-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 text-xs text-slate-600">
                    <div>
                      <span className="font-medium text-slate-500">Applicant:</span>{" "}
                      {app.applicant_name || snapshotFields(app.applicant_snapshot).name || "N/A"}
                    </div>
                    {snapshotFields(app.applicant_snapshot).experience ? (
                      <div>
                        <span className="font-medium text-slate-500">Experience:</span>{" "}
                        {snapshotFields(app.applicant_snapshot).experience}
                      </div>
                    ) : null}
                    {app.resume_url ? (
                      <div className="sm:col-span-2">
                        <span className="font-medium text-slate-500">Resume / Profile:</span>{" "}
                        <a
                          href={app.resume_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-blue-600 underline"
                        >
                          View Resume
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {app.cover_note ? (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Cover Note:</span>
                      <p className="mt-0.5 line-clamp-2 rounded bg-slate-50 p-2 text-slate-600 italic">
                        &ldquo;{app.cover_note}&rdquo;
                      </p>
                    </div>
                  ) : null}

                  {/* Status events timeline if present */}
                  {app.status_events && app.status_events.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      {app.status_events.map((ev) => (
                        <span
                          key={ev.id}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          <Clock className="h-3 w-3 text-slate-400" />
                          {ev.kind}: {ev.to_status} ({new Date(ev.created_at).toLocaleDateString()})
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {canWithdraw(app.status) ? (
                    withdrawingId === app.id ? (
                      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs">
                        <span className="text-rose-700">Withdraw application?</span>
                        <button
                          onClick={() => withdraw.mutate(app.id)}
                          disabled={withdraw.isPending}
                          className="rounded bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-700"
                        >
                          {withdraw.isPending ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setWithdrawingId(null)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setWithdrawingId(app.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Withdraw
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
