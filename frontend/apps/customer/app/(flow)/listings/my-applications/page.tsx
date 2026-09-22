"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Clock, FileText } from "lucide-react";

import {
  fetchMyApplications,
  withdrawApplication,
  type ListingApplication,
} from "@/features/listings/queries";
import { ApplicationCard } from "@/features/listings/view";

const FILTER_TABS = [
  { key: "ALL", label: "All Applications" },
  { key: "ACTIVE", label: "In Progress" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "CLOSED", label: "Completed / Closed" },
];

export default function MyApplicationsPage() {
  const queryClient = useQueryClient();
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
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-slate-800"
        >
          <BriefcaseBusiness className="h-4 w-4" /> Browse Opportunities
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
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

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : null}

      {withdrawNotice ? (
        <div
          role={withdrawNotice.kind === "error" ? "alert" : "status"}
          className={`rounded-lg border p-4 text-sm ${
            withdrawNotice.kind === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {withdrawNotice.message}
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
