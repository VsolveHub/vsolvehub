"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Clock } from "lucide-react";
import { EmptyState, ErrorState } from "@vsolve/ui";

import {
  fetchMyApplications,
  withdrawApplication,
  type ListingApplication,
} from "@/features/listings/queries";
import { ApplicationCard } from "@/features/listings/view";
import { fetchSavedJobs } from "@/features/listings/seeker-queries";

const FILTER_TABS = [
  { key: "ALL", label: "All Applications" },
  { key: "ACTIVE", label: "In Progress" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CLOSED", label: "Completed / Closed" },
];

export default function MyApplicationsPage() {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["saved-jobs"], queryFn: fetchSavedJobs });
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawNotice, setWithdrawNotice] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  const { data: applications = [], isLoading, error } = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
  });

  const withdraw = useMutation({
    mutationFn: (applicationId: string) => withdrawApplication(applicationId),
    onSuccess: () => {
      setWithdrawingId(null);
      setWithdrawNotice({
        kind: "success",
        message: "Application withdrawn. You can apply again after the 24-hour cooldown.",
      });
      queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: (err) => {
      setWithdrawingId(null);
      setWithdrawNotice({
        kind: "error",
        message:
          err instanceof Error && err.message
            ? err.message
            : "Could not withdraw your application. Please try again.",
      });
    },
  });

  const filteredApplications = applications.filter((app) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE")
      return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "CONTACTED"].includes(app.status);
    if (activeTab === "CLOSED")
      return ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
    return app.status === activeTab;
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/listings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-text"
          >
            <ArrowLeft className="size-4" /> Back to Job Listings
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">
            My Job Applications
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track, monitor, and manage all your career applications in one place.
          </p>
        </div>
        <Link
          href="/listings"
          className="inline-flex items-center justify-center gap-2 rounded-control bg-navy-900 px-4 py-2.5 text-sm font-semibold text-warm-0 shadow-card transition hover:bg-navy-800"
        >
          <BriefcaseBusiness className="size-4" /> Browse Opportunities
        </Link>
      </div>

      {(saved.data ?? []).length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-navy-900">Saved jobs</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(saved.data ?? []).map((job) => (
              <Link
                key={job.id}
                href={`/listings/${job.slug || job.id}`}
                className="w-56 shrink-0 rounded-card border border-line bg-surface p-3 hover:border-action"
              >
                <p className="text-sm font-bold text-navy-900">{job.title}</p>
                <p className="text-xs text-text-secondary">{job.poster_name}</p>
                <p className="text-xs text-text-secondary">{job.location_text}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {FILTER_TABS.map((tab) => (
          <button
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

      {error ? (
        <ErrorState
          title="Could not load your applications"
          message={(error as Error).message || "An unexpected error occurred while fetching your applications."}
        />
      ) : null}

      {withdrawNotice ? (
        <div
          role={withdrawNotice.kind === "error" ? "alert" : "status"}
          className={`rounded-control border p-4 text-sm font-medium ${
            withdrawNotice.kind === "error"
              ? "border-danger-line bg-danger-surface text-danger-text"
              : "border-success-line bg-success-surface text-success-text"
          }`}
        >
          {withdrawNotice.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Clock className="size-6 animate-spin text-text-muted" />
          <span className="ml-2 text-sm">Loading applications...</span>
        </div>
      ) : null}

      {!isLoading && filteredApplications.length === 0 ? (
        <EmptyState
          title="No applications found"
          description={
            activeTab === "ALL"
              ? "You have not applied to any job listings yet."
              : "No applications match the selected filter."
          }
          action={
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 rounded-control bg-navy-900 px-4 py-2 text-sm font-semibold text-warm-0 hover:bg-navy-800"
            >
              Explore Open Listings
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-4">
        {filteredApplications.map((app: ListingApplication) => (
          <ApplicationCard
            key={app.id}
            app={app}
            isWithdrawing={withdrawingId === app.id}
            onStartWithdraw={() => setWithdrawingId(app.id)}
            onCancelWithdraw={() => setWithdrawingId(null)}
            onConfirmWithdraw={() => withdraw.mutate(app.id)}
            isPending={withdraw.isPending}
          />
        ))}
      </div>
    </main>
  );
}
