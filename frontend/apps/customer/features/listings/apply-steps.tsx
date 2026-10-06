"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { AlreadyAppliedCard } from "./view/already-applied-card";
import { uploadListingResume } from "./queries";
import { applySchema, issuesToFieldErrors, type ApplyFormState } from "./model";

export function ApplySteps({
  listingId,
  posterName,
  isAuthenticated,
  isSuccess,
  activeApplication,
  form,
  fieldErrors,
  isPending,
  serverError,
  onFieldChange,
  onErrors,
  onSubmit,
}: {
  listingId: string;
  posterName?: string;
  isAuthenticated: boolean;
  isSuccess?: boolean;
  activeApplication?: { status?: string };
  form: ApplyFormState;
  fieldErrors: Record<string, string>;
  isPending: boolean;
  serverError?: string;
  onFieldChange: (key: keyof ApplyFormState, value: string | boolean) => void;
  onErrors: (errors: Record<string, string>) => void;
  onSubmit: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fileName, setFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const saved = useSavedItems("listing");

  if (!isAuthenticated) {
    return (
      <section id="apply-panel" className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-lg font-bold">Apply for this Position</h2>
        <p className="mt-2 text-xs text-text-secondary">Sign in to send this application to {posterName}.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-login-popup"))}
          className="mt-4 w-full rounded-control bg-action py-2.5 text-sm font-bold text-action-text"
        >
          Sign In / Register
        </button>
      </section>
    );
  }

  if (isSuccess) {
    return (
      <section id="apply-panel" className="rounded-card border border-line bg-surface p-6">
        <div className="rounded-card border border-success-line bg-success-surface p-5 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success-text" />
          <h3 className="mt-2 text-sm font-bold text-success-text">Application Submitted!</h3>
          <p className="mt-1 text-xs text-success-text">
            Your application has been received by {posterName}. Track updates in My Applications.
          </p>
          <Link
            href="/listings/my-applications"
            className="mt-4 inline-flex items-center justify-center rounded-control bg-navy-900 px-4 py-2 text-xs font-semibold text-warm-0 hover:bg-navy-800"
          >
            View in My Applications →
          </Link>
        </div>
      </section>
    );
  }

  if (activeApplication) {
    return (
      <section id="apply-panel" className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-lg font-bold">Apply for this Position</h2>
        <AlreadyAppliedCard posterName={posterName} status={activeApplication.status} />
      </section>
    );
  }

  return (
    <section id="apply-panel" className="rounded-card border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Apply for this Position</h2>
          <p className="text-xs text-text-secondary">Step {step} of 2</p>
        </div>
        <SaveHeart saved={saved.isSaved(listingId)} onToggle={() => saved.toggle(listingId)} />
      </div>
      {step === 1 ? (
        <form
          className="mt-4 space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = applySchema.safeParse(form);
            if (!parsed.success) {
              onErrors(issuesToFieldErrors(parsed.error));
              return;
            }
            onErrors({});
            setStep(2);
          }}
        >
          <label className="block text-xs font-semibold">
            Full name
            <input className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm" value={form.name} onChange={(e) => onFieldChange("name", e.target.value)} />
          </label>
          {fieldErrors.name ? <p className="text-xs text-danger-text">{fieldErrors.name}</p> : null}
          <label className="block text-xs font-semibold">
            Phone
            <input className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm" value={form.phone} onChange={(e) => onFieldChange("phone", e.target.value)} />
          </label>
          {fieldErrors.phone ? <p className="text-xs text-danger-text">{fieldErrors.phone}</p> : null}
          <label className="block text-xs font-semibold">
            Email
            <input className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm" value={form.email} onChange={(e) => onFieldChange("email", e.target.value)} />
          </label>
          {fieldErrors.email ? <p className="text-xs text-danger-text">{fieldErrors.email}</p> : null}
          <label className="block text-xs font-semibold">
            Resume
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf"
              className="mt-1 block w-full text-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setUploadError("");
                void uploadListingResume(listingId, file)
                  .then((body) => {
                    const url = String((body as { resume_url?: string }).resume_url ?? "");
                    if (url) onFieldChange("resume_url", url);
                  })
                  .catch((err: Error) => setUploadError(err.message));
              }}
            />
          </label>
          {fileName ? <p className="text-xs text-text-secondary">{fileName}</p> : null}
          {uploadError ? <p className="text-xs text-danger-text">{uploadError}</p> : null}
          {fieldErrors.resume_url ? <p className="text-xs text-danger-text">{fieldErrors.resume_url}</p> : null}
          <label className="block text-xs font-semibold">
            Experience
            <input
              className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm"
              placeholder="e.g. 2 years, or Fresher"
              maxLength={120}
              value={form.experience}
              onChange={(e) => onFieldChange("experience", e.target.value)}
            />
          </label>
          {fieldErrors.experience ? <p className="text-xs text-danger-text">{fieldErrors.experience}</p> : null}
          <label className="block text-xs font-semibold">
            Your skills
            <input
              className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm"
              placeholder="e.g. Python, React, Customer support"
              value={form.skills}
              onChange={(e) => onFieldChange("skills", e.target.value)}
            />
            <span className="mt-1 block font-normal text-text-secondary">Separate skills with commas.</span>
          </label>
          {fieldErrors.skills ? <p className="text-xs text-danger-text">{fieldErrors.skills}</p> : null}
          <label className="block text-xs font-semibold">
            Cover note
            <textarea className="mt-1 w-full rounded-control border border-line px-3 py-2 text-sm" maxLength={500} value={form.cover_note} onChange={(e) => onFieldChange("cover_note", e.target.value)} />
          </label>
          {fieldErrors.cover_note ? <p className="text-xs text-danger-text">{fieldErrors.cover_note}</p> : null}
          <label className="flex items-start gap-2 rounded-control border border-line bg-surface-sunken p-3 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.findable}
              onChange={(e) => onFieldChange("findable", e.target.checked)}
            />
            <span>
              <span className="block font-semibold">Let other employers with matching jobs find my profile</span>
              <span className="mt-0.5 block text-text-secondary">
                They see your name, area, experience and skills, and can invite you to apply. Your phone
                number is shared only with employers you apply to. Change this anytime in your job profile.
              </span>
            </span>
          </label>
          <button type="submit" className="w-full rounded-control bg-action py-2.5 text-sm font-bold text-action-text">
            Review Application
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-2 text-sm">
          <p>{form.name}</p>
          <p>{form.phone}</p>
          <p>{form.email || "No email"}</p>
          <p className="text-xs text-text-secondary">{form.resume_url || "No resume uploaded"}</p>
          {form.experience ? <p className="text-xs">Experience: {form.experience}</p> : null}
          {form.skills ? <p className="text-xs">Skills: {form.skills}</p> : null}
          <p className="text-xs">{form.cover_note}</p>
          <p className="text-xs text-text-secondary">
            {form.findable
              ? "Other employers with matching jobs can find your profile."
              : "Only employers you apply to will see your profile."}
          </p>
          {Object.keys(fieldErrors).length > 0 ? (
            <div role="alert" className="rounded-control border border-danger-line bg-danger-surface p-3 text-xs text-danger-text">
              <p className="font-semibold">Check these fields</p>
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(fieldErrors).map(([key, message]) =>
                  message ? <li key={key}>{message}</li> : null,
                )}
              </ul>
            </div>
          ) : null}
          {serverError ? (
            <div role="alert" className="rounded-control border border-danger-line bg-danger-surface p-3 text-xs text-danger-text">
              <p className="font-semibold">Application couldn&apos;t be submitted</p>
              <p className="mt-0.5">{serverError}</p>
            </div>
          ) : null}
          <button type="button" className="text-xs underline" onClick={() => setStep(1)}>Back</button>
          <button type="button" disabled={isPending} onClick={onSubmit} className="block w-full rounded-control bg-action py-2.5 text-sm font-bold text-action-text disabled:opacity-50">
            {isPending ? "Sending…" : "Submit application"}
          </button>
          <Link href="/listings/my-applications" className="block text-center text-xs text-text-secondary">My applications</Link>
        </div>
      )}
    </section>
  );
}
