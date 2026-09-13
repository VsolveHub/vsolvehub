"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  Building,
  CheckCircle2,
  Clock,
  Coins,
  FileCheck2,
  FileText,
  Flag,
  Flame,
  Globe,
  Info,
  Lock,
  LogIn,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";

import {
  fetchListing,
  reportListing,
  submitListingApplication,
} from "@/features/listings/queries";
import { useCustomerSession } from "@/features/session/queries";

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = params.listingId;
  const queryClient = useQueryClient();
  const session = useCustomerSession();

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => fetchListing(listingId),
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    experience: "",
    cover_note: "",
    resume_url: "",
  });

  // Pre-fill profile details when authenticated
  useEffect(() => {
    if (session.isAuthenticated) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || session.fullName || session.displayName || "",
        phone: prev.phone || session.phoneNumber || "",
        email: prev.email || session.email || "",
      }));
    }
  }, [session.isAuthenticated, session.fullName, session.displayName, session.phoneNumber, session.email]);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [reportDetail, setReportDetail] = useState("");

  const apply = useMutation({
    mutationFn: () => submitListingApplication(listingId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
      queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
  });

  const report = useMutation({
    mutationFn: () => reportListing(listingId, reportReason, reportDetail),
    onSuccess: () => {
      setReportModalOpen(false);
      setReportDetail("");
    },
  });

  if (isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl items-center justify-center py-20 text-slate-400">
        <Clock className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm">Loading listing details...</span>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Listing Not Available</h2>
        <p className="mt-1 text-sm text-slate-500">
          This listing may have expired, closed, or is temporarily under review.
        </p>
        <Link
          href="/listings"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Job Board
        </Link>
      </main>
    );
  }

  const fields = listing.structured_fields || {};

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to open listings
        </Link>
        <Link
          href="/listings/my-applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          <FileCheck2 className="h-3.5 w-3.5" /> My Applications
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main Listing Content */}
        <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                <Building className="h-3.5 w-3.5 text-slate-500" />
                {listing.poster_name || "Verified Employer"}
              </span>
              {listing.is_premium && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                  Featured
                </span>
              )}
              {listing.published_at && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Published {new Date(listing.published_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {listing.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-slate-400" />
                {listing.location_text || "Location shared upon contact"}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">
                {listing.application_count} {listing.application_count === 1 ? "applicant" : "applicants"} applied
              </span>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Structured Attributes Grid */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Role Details & Requirements
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listing.service_name && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <dt className="text-xs text-slate-500">Category Service</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{listing.service_name}</dd>
                </div>
              )}
              {Object.entries(fields).map(([key, val]) => (
                <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <dt className="text-xs capitalize text-slate-500">{key.replaceAll("_", " ")}</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{String(val)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Job Description
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {listing.description}
            </p>
          </div>

          {/* Masked Contact Guarantee Card */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-slate-50 p-4.5 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-indigo-950 text-sm">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Privacy-Protected Contact Exchange
            </div>
            <p className="mt-1.5 leading-relaxed text-slate-600">
              Hiring contact info:
              <span className="mx-1 font-mono font-medium text-slate-800">
                {listing.contact_masked?.phone || "+91 98••••••88"}
              </span>
              |
              <span className="mx-1 font-mono font-medium text-slate-800">
                {listing.contact_masked?.email || "co••••@example.com"}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Neither your direct phone nor email is published publicly. Verified posters unlock candidate
              details only for legitimate recruitment interviews.
            </p>
          </div>

          {/* Report Button */}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setReportModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-rose-600"
            >
              <Flag className="h-3.5 w-3.5" />
              Report suspicious or abusive job listing
            </button>
          </div>
        </section>

        {/* Application Form Aside */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-950">Apply for this Position</h2>
            <p className="text-xs text-slate-500">
              Direct application submitted securely to the employer.
            </p>
          </div>

          {apply.isSuccess ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <h3 className="mt-2 text-sm font-semibold text-emerald-900">Application Submitted!</h3>
              <p className="mt-1 text-xs text-emerald-700">
                Your application has been received by {listing.poster_name}. You can track status updates in your dashboard.
              </p>
              <Link
                href="/listings/my-applications"
                className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
              >
                View in My Applications &rarr;
              </Link>
            </div>
          ) : !session.isAuthenticated ? (
            <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <User className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Sign in to Apply</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Please sign in with your phone number to submit your application and track responses from {listing.poster_name}.
              </p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("open-login-popup"))}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <LogIn className="h-4 w-4" />
                Sign In / Register
              </button>
            </div>
          ) : (
            <form
              className="mt-5 space-y-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                apply.mutate();
              }}
            >
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  required
                  placeholder="e.g. Sarah Jenkins"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Contact Phone <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  required
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Email Address</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                  type="email"
                  placeholder="e.g. sarah@example.com"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Experience / Qualification
                </label>
                <input
                  value={form.experience}
                  onChange={(e) => setForm((c) => ({ ...c, experience: e.target.value }))}
                  placeholder="e.g. 4 years in Frontend React / Python"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Resume Link / Portfolio URL
                </label>
                <input
                  value={form.resume_url}
                  onChange={(e) => setForm((c) => ({ ...c, resume_url: e.target.value }))}
                  type="url"
                  placeholder="https://drive.google.com/... or linkedin"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Cover Note / Message to Poster
                </label>
                <textarea
                  value={form.cover_note}
                  onChange={(e) => setForm((c) => ({ ...c, cover_note: e.target.value }))}
                  rows={3}
                  placeholder="Briefly introduce yourself and your availability..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {apply.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold">Application couldn&apos;t be submitted</p>
                  <p className="mt-0.5">{(apply.error as Error).message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={apply.isPending}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {apply.isPending ? (
                  <Clock className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {apply.isPending ? "Submitting..." : "Submit Application"}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                By submitting, you agree to share your application snapshot with {listing.poster_name}.
              </p>
            </form>
          )}
        </aside>
      </div>

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-600" />
                Report Listing
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Help us maintain community safety. Reports open an immediate review ticket for our
              operations team.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none"
                >
                  <option value="spam_or_abuse">Spam, Phishing, or Scam</option>
                  <option value="fraudulent">Fraudulent or Asking for Upfront Payment</option>
                  <option value="inaccurate_details">Inaccurate or Misleading Role Details</option>
                  <option value="offensive_content">Offensive or Inappropriate Content</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Additional Details</label>
                <textarea
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue you noticed..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none"
                />
              </div>

              {report.error && (
                <p className="text-xs text-red-600">{(report.error as Error).message}</p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => report.mutate()}
                  disabled={report.isPending}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {report.isPending ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
