"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  FileCheck2,
  Flag,
  Flame,
  LogIn,
  MapPin,
  Send,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import { ApiRequestError } from "@vsolve/api-client";
import { PHONE_COUNTRIES, PhoneField, toNationalDigits } from "@vsolve/ui";
import { z } from "zod";

import {
  fetchListing,
  fetchMyApplications,
  reportListing,
  submitListingApplication,
} from "@/features/listings/queries";
import { useCustomerSession } from "@/features/session/queries";

/**
 * Mirrors `SubmitApplicationSerializer` on the server, which stays the authority.
 * Validating here means the demo shows a precise message under the field instead
 * of a round-trip 400.
 */
const applySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(120, "Name must be 120 characters or fewer.")
    .refine((value) => /[a-zA-Z]/.test(value), "Enter your full name."),
  // PhoneField holds national digits only (the +91 is a fixture of the control),
  // so the rule is an exact length rather than "at least". The server normalises
  // to E.164 with an IN default region either way.
  phone: z
    .string()
    .trim()
    .min(1, "Enter your contact phone number.")
    .refine(
      (value) => /^\d{10}$/.test(value.replace(/\D/g, "")),
      "Enter a 10-digit mobile number.",
    ),
  email: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .refine(
      (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      "Enter a valid email address.",
    ),
  experience: z.string().trim().max(120, "Keep this to 120 characters or fewer."),
  resume_url: z
    .string()
    .trim()
    .max(500, "Keep the link to 500 characters or fewer.")
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
      "Enter a link starting with http:// or https://",
    ),
  cover_note: z.string().trim().max(2000, "Keep your note to 2000 characters or fewer."),
});

function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function serverFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const first = messages[0];
    if (first) out[field] = first;
  }
  return out;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-rose-600">{message}</p>;
}

/** Applicant-facing labels. The API's own vocabulary is not shown to customers. */
const APPLICATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  CONTACTED: "Contacted",
  REJECTED: "Not selected",
};

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = params.listingId;
  const queryClient = useQueryClient();
  const session = useCustomerSession();

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => fetchListing(listingId),
  });

  const myApplicationsQuery = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
    enabled: session.isAuthenticated,
  });

  /**
   * Whether this applicant already has a live application on this listing.
   *
   * The server is still the authority — it refuses a second active application
   * (scenario M3-A10-05). This only stops us handing a customer a form that is
   * guaranteed to be rejected, and points them at the status instead.
   */
  const activeApplication = (() => {
    const rows = (myApplicationsQuery.data ?? []) as Array<{
      listing?: string;
      status?: string;
      created_at?: string;
    }>;
    return rows.find(
      (row) => row.listing === listingId && row.status !== "WITHDRAWN" && row.status !== "EXPIRED",
    );
  })();

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
        // The session carries E.164 (`+919876543210`) while this control holds
        // national digits, so strip the dial code on the way in. Without this the
        // field arrives pre-filled with a value its own validation rejects, and
        // the applicant sees an error on a field they never touched.
        phone:
          prev.phone ||
          toNationalDigits(session.phoneNumber ?? "", PHONE_COUNTRIES.IN),
        email: prev.email || session.email || "",
      }));
    }
  }, [session.isAuthenticated, session.fullName, session.displayName, session.phoneNumber, session.email]);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [reportDetail, setReportDetail] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const apply = useMutation({
    mutationFn: () => submitListingApplication(listingId, form),
    onSuccess: () => {
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
      queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: (error) => setFieldErrors(serverFieldErrors(error)),
  });

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  }

  function handleApply() {
    const parsed = applySchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(issuesToFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    apply.mutate();
  }

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
          ) : activeApplication ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-amber-600" />
              <h3 className="mt-2 text-sm font-semibold text-amber-900">
                You have already applied
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Your application for this role is{" "}
                <span className="font-semibold">
                  {APPLICATION_STATUS_LABELS[activeApplication.status ?? ""] ??
                    activeApplication.status ??
                    "in progress"}
                </span>
                . {listing.poster_name} can now review it.
              </p>
              <Link
                href="/listings/my-applications"
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-800"
              >
                <FileCheck2 className="h-4 w-4" />
                Track it in My Applications
              </Link>
              <p className="mt-2 text-[11px] text-amber-700">
                One application per listing. You can withdraw it from My Applications.
              </p>
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
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                handleApply();
              }}
            >
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.name ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.name} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Contact Phone <span className="text-rose-500">*</span>
                </label>
                <PhoneField
                  chrome={false}
                  value={form.phone}
                  onValueChange={(next) => updateField("phone", next)}
                  placeholder="98765 43210"
                  aria-label="Contact phone"
                  aria-invalid={Boolean(fieldErrors.phone)}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.phone ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.phone} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Email Address</label>
                <input
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  type="email"
                  placeholder="e.g. sarah@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.email ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Experience / Qualification
                </label>
                <input
                  value={form.experience}
                  onChange={(e) => updateField("experience", e.target.value)}
                  placeholder="e.g. 4 years in Frontend React / Python"
                  aria-invalid={Boolean(fieldErrors.experience)}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.experience ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.experience} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Resume Link / Portfolio URL
                </label>
                <input
                  value={form.resume_url}
                  onChange={(e) => updateField("resume_url", e.target.value)}
                  type="url"
                  placeholder="https://drive.google.com/... or linkedin"
                  aria-invalid={Boolean(fieldErrors.resume_url)}
                  className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.resume_url ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.resume_url} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Cover Note / Message to Poster
                </label>
                <textarea
                  value={form.cover_note}
                  onChange={(e) => updateField("cover_note", e.target.value)}
                  rows={3}
                  placeholder="Briefly introduce yourself and your availability..."
                  aria-invalid={Boolean(fieldErrors.cover_note)}
                  className={`mt-1 w-full rounded-lg border p-3 text-sm outline-none transition focus:ring-1 ${fieldErrors.cover_note ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"}`}
                />
                <FieldError message={fieldErrors.cover_note} />
              </div>

              {apply.error && Object.keys(fieldErrors).length === 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
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
