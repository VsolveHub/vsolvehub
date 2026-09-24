"use client";

import { useState } from "react";
import Link from "next/link";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { uploadListingResume } from "./queries";
import { applySchema, issuesToFieldErrors, type ApplyFormState } from "./model";

export function ApplySteps({
  listingId,
  posterName,
  isAuthenticated,
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
  form: ApplyFormState;
  fieldErrors: Record<string, string>;
  isPending: boolean;
  serverError?: string;
  onFieldChange: (key: keyof ApplyFormState, value: string) => void;
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
          <p className="text-xs text-danger-text">{fieldErrors.name}</p>
          <label className="block text-xs font-semibold">
            Phone
            <input className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm" value={form.phone} onChange={(e) => onFieldChange("phone", e.target.value)} />
          </label>
          <label className="block text-xs font-semibold">
            Email
            <input className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm" value={form.email} onChange={(e) => onFieldChange("email", e.target.value)} />
          </label>
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
          <label className="block text-xs font-semibold">
            Cover note
            <textarea className="mt-1 w-full rounded-control border border-line px-3 py-2 text-sm" maxLength={500} value={form.cover_note} onChange={(e) => onFieldChange("cover_note", e.target.value)} />
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
          <p className="text-xs">{form.cover_note}</p>
          {serverError ? <p className="text-xs text-danger-text">{serverError}</p> : null}
          <button type="button" className="text-xs underline" onClick={() => setStep(1)}>Back</button>
          <button type="button" disabled={isPending} onClick={onSubmit} className="block w-full rounded-control bg-action py-2.5 text-sm font-bold text-action-text">
            {isPending ? "Sending…" : "Submit application"}
          </button>
          <Link href="/listings/my-applications" className="block text-center text-xs text-text-secondary">My applications</Link>
        </div>
      )}
    </section>
  );
}
