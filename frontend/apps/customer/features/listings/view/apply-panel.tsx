import Link from "next/link";
import { CheckCircle2, Clock, LogIn, Send, User } from "lucide-react";
import { PhoneField } from "@vsolve/ui";

import type { ApplyFormState } from "../model";
import { AlreadyAppliedCard } from "./already-applied-card";
import { FieldError } from "./field-error";

export interface ApplyPanelProps {
  posterName?: string;
  isSuccess: boolean;
  activeApplication?: { status?: string };
  isAuthenticated: boolean;
  form: ApplyFormState;
  fieldErrors: Record<string, string>;
  isPending: boolean;
  serverError?: string;
  onFieldChange: (key: keyof ApplyFormState, value: string) => void;
  onSubmit: () => void;
}

export function ApplyPanel({
  posterName,
  isSuccess,
  activeApplication,
  isAuthenticated,
  form,
  fieldErrors,
  isPending,
  serverError,
  onFieldChange,
  onSubmit,
}: ApplyPanelProps) {
  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-950">Apply for this Position</h2>
        <p className="text-xs text-slate-500">
          Direct application submitted securely to the employer.
        </p>
      </div>

      {isSuccess ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h3 className="mt-2 text-sm font-semibold text-emerald-900">Application Submitted!</h3>
          <p className="mt-1 text-xs text-emerald-700">
            Your application has been received by {posterName}. You can track status updates in your dashboard.
          </p>
          <Link
            href="/listings/my-applications"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
          >
            View in My Applications &rarr;
          </Link>
        </div>
      ) : activeApplication ? (
        <AlreadyAppliedCard posterName={posterName} status={activeApplication.status} />
      ) : !isAuthenticated ? (
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <User className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">Sign in to Apply</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Please sign in with your phone number to submit your application and track responses from {posterName}.
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
            onSubmit();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              aria-invalid={Boolean(fieldErrors.name)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.name
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
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
              onValueChange={(next) => onFieldChange("phone", next)}
              placeholder="98765 43210"
              aria-label="Contact phone"
              aria-invalid={Boolean(fieldErrors.phone)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.phone
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
            <FieldError message={fieldErrors.phone} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Email Address</label>
            <input
              value={form.email}
              onChange={(e) => onFieldChange("email", e.target.value)}
              type="email"
              placeholder="e.g. sarah@example.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.email
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Experience / Qualification
            </label>
            <input
              value={form.experience}
              onChange={(e) => onFieldChange("experience", e.target.value)}
              placeholder="e.g. 4 years in Frontend React / Python"
              aria-invalid={Boolean(fieldErrors.experience)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.experience
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
            <FieldError message={fieldErrors.experience} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Resume Link / Portfolio URL
            </label>
            <input
              value={form.resume_url}
              onChange={(e) => onFieldChange("resume_url", e.target.value)}
              type="url"
              placeholder="https://drive.google.com/... or linkedin"
              aria-invalid={Boolean(fieldErrors.resume_url)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.resume_url
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
            <FieldError message={fieldErrors.resume_url} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Cover Note / Message to Poster
            </label>
            <textarea
              value={form.cover_note}
              onChange={(e) => onFieldChange("cover_note", e.target.value)}
              rows={3}
              placeholder="Briefly introduce yourself and your availability..."
              aria-invalid={Boolean(fieldErrors.cover_note)}
              className={`mt-1 w-full rounded-lg border p-3 text-sm outline-none transition focus:ring-1 ${
                fieldErrors.cover_note
                  ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500"
                  : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
            <FieldError message={fieldErrors.cover_note} />
          </div>

          {serverError && Object.keys(fieldErrors).length === 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              <p className="font-semibold">Application couldn&apos;t be submitted</p>
              <p className="mt-0.5">{serverError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? (
              <Clock className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isPending ? "Submitting..." : "Submit Application"}
          </button>

          <p className="text-center text-[11px] text-slate-400">
            By submitting, you agree to share your application snapshot with {posterName}.
          </p>
        </form>
      )}
    </aside>
  );
}
