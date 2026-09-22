import Link from "next/link";
import { CheckCircle2, Clock, LogIn, Send, User } from "lucide-react";
import { Card, PhoneField } from "@vsolve/ui";

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
    <Card id="apply-panel" className="h-fit p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-text">Apply for this Position</h2>
        <p className="text-xs text-text-muted">
          Direct application submitted securely to the employer.
        </p>
      </div>

      {isSuccess ? (
        <div className="mt-5 rounded-card border border-success-line bg-success-surface p-5 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success-text" />
          <h3 className="mt-2 text-sm font-bold text-success-text">Application Submitted!</h3>
          <p className="mt-1 text-xs text-success-text">
            Your application has been received by {posterName}. You can track status updates in your dashboard.
          </p>
          <Link
            href="/listings/my-applications"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-control bg-navy-900 px-4 py-2 text-xs font-semibold text-warm-0 transition hover:bg-navy-800"
          >
            View in My Applications &rarr;
          </Link>
        </div>
      ) : activeApplication ? (
        <AlreadyAppliedCard posterName={posterName} status={activeApplication.status} />
      ) : !isAuthenticated ? (
        <div className="mt-5 rounded-card border border-navy-200 bg-navy-50/60 p-6 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-navy-100 text-navy-700">
            <User className="size-5" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-text">Sign in to Apply</h3>
          <p className="mt-1 text-xs text-text-secondary leading-relaxed">
            Please sign in with your phone number to submit your application and track responses from {posterName}.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-login-popup"))}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control bg-navy-900 px-4 py-2.5 text-xs font-semibold text-warm-0 shadow-card transition hover:bg-navy-800"
          >
            <LogIn className="size-4" />
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
            <label className="block text-xs font-semibold text-text-secondary">
              Full Name <span className="text-danger-text">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              aria-invalid={Boolean(fieldErrors.name)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.name
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Contact Phone <span className="text-danger-text">*</span>
            </label>
            <PhoneField
              chrome={false}
              value={form.phone}
              onValueChange={(next) => onFieldChange("phone", next)}
              placeholder="98765 43210"
              aria-label="Contact phone"
              aria-invalid={Boolean(fieldErrors.phone)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.phone
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.phone} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">Email Address</label>
            <input
              value={form.email}
              onChange={(e) => onFieldChange("email", e.target.value)}
              type="email"
              placeholder="e.g. sarah@example.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.email
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Experience / Qualification
            </label>
            <input
              value={form.experience}
              onChange={(e) => onFieldChange("experience", e.target.value)}
              placeholder="e.g. 4 years in Frontend React / Python"
              aria-invalid={Boolean(fieldErrors.experience)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.experience
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.experience} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Resume Link / Portfolio URL
            </label>
            <input
              value={form.resume_url}
              onChange={(e) => onFieldChange("resume_url", e.target.value)}
              type="url"
              placeholder="https://drive.google.com/... or linkedin"
              aria-invalid={Boolean(fieldErrors.resume_url)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.resume_url
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.resume_url} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Cover Note / Message to Poster
            </label>
            <textarea
              value={form.cover_note}
              onChange={(e) => onFieldChange("cover_note", e.target.value)}
              rows={3}
              placeholder="Briefly introduce yourself and your availability..."
              aria-invalid={Boolean(fieldErrors.cover_note)}
              className={`mt-1 w-full rounded-control border bg-surface p-3 text-sm text-text outline-none transition focus:ring-1 ${
                fieldErrors.cover_note
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={fieldErrors.cover_note} />
          </div>

          {serverError && Object.keys(fieldErrors).length === 0 && (
            <div
              role="alert"
              className="rounded-control border border-danger-line bg-danger-surface p-3 text-xs text-danger-text"
            >
              <p className="font-semibold">Application couldn&apos;t be submitted</p>
              <p className="mt-0.5">{serverError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-action px-4 text-sm font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
          >
            {isPending ? (
              <Clock className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {isPending ? "Submitting..." : "Submit Application"}
          </button>

          <p className="text-center text-[11px] text-text-muted">
            By submitting, you agree to share your application snapshot with {posterName}.
          </p>
        </form>
      )}
    </Card>
  );
}
