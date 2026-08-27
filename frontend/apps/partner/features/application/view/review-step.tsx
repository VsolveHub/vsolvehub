"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Spinner } from "@vsolve/ui";
import {
  CheckCircle2,
  AlertCircle,
  Edit2,
  User,
  Wrench,
  MapPin,
  FileCheck,
  FileText,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { isVersionConflict, usePartnerApplication, useSubmitApplication } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ApplicationStatusBanner } from "./status-banner";

export function ReviewStep() {
  const query = usePartnerApplication();
  const reference = useApplicationReference();
  const submit = useSubmitApplication();
  const [confirmed, setConfirmed] = useState(false);

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading your application summary…
      </p>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;

  if (application === null) {
    return (
      <section className="rounded-card bg-surface p-6 border border-line text-center">
        <h1 className="text-xl font-bold text-text">Review and Submit</h1>
        <p className="mt-2 text-sm text-text-secondary">
          You have not started your application yet.
        </p>
        <Link
          href="/apply/about"
          className="mt-4 inline-flex items-center gap-2 rounded-control bg-action px-6 py-2.5 text-sm font-bold text-action-text"
        >
          Start Your Application Now
        </Link>
      </section>
    );
  }

  const outstanding = outstandingRequirements(application);
  const ready = canSubmit(application);
  const activeConsents = application.consents.filter(
    (consent) => consent.withdrawn_at === null,
  );

  // Lookup maps for human readable labels
  const skillNameMap = new Map(reference.skills.map((s) => [s.code, s.name]));
  const areaNameMap = new Map(reference.serviceAreas.map((a) => [a.id, a.name]));

  const documents = application.documents.filter((d) => d.status !== "SUPERSEDED");

  return (
    <section className="flex flex-col gap-6 pb-20">
      <div>
        <h1 className="text-2xl font-extrabold text-text tracking-tight">Review & Submit</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Please review your details below before sending for partner verification. You can edit any section.
        </p>
      </div>

      <ApplicationStatusBanner application={application} />

      {/* Outstanding requirements notice if not ready */}
      {!ready && (
        <div className="rounded-card border border-warning-line bg-warning-surface p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-warning-text">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Items remaining before you can submit:</span>
          </div>
          {/*
            These are the only way to reach the step that is blocking
            submission, so they have to be thumb-sized. As bare inline text they
            were 15px tall; `inline-flex min-h-11` gives the row real height
            without changing the list's look.
          */}
          <ul className="mt-2 pl-6 list-disc text-xs font-semibold text-warning-text/90">
            {outstanding.map((req) => (
              <li key={req.code}>
                <Link
                  href={req.href}
                  className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-navy-900"
                >
                  {req.label} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 1: Personal Profile */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">1. Personal Profile</h2>
          </div>
          {isEditable(application) && (
            <Link
              href="/apply/about"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-signal-700 underline underline-offset-4"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-xs font-bold text-text-muted uppercase">Display Name</span>
            <p className="font-bold text-text mt-0.5">
              {application.display_name || <span className="text-text-muted italic">Not set</span>}
            </p>
          </div>
          <div>
            <span className="text-xs font-bold text-text-muted uppercase">Experience</span>
            <p className="font-bold text-text mt-0.5">
              {application.experience_years} {application.experience_years === 1 ? "Year" : "Years"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-xs font-bold text-text-muted uppercase">Biography / About</span>
            <p className="text-xs leading-relaxed text-text-secondary mt-1 whitespace-pre-line bg-surface-sunken p-3 rounded-control border border-line">
              {application.biography || "No biography entered yet."}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Trades & Services */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">2. Trades & Services</h2>
          </div>
          {isEditable(application) && (
            <Link
              href="/apply/work"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-signal-700 underline underline-offset-4"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div>
            <span className="text-xs font-bold text-text-muted uppercase">Selected Trades</span>
            {application.skill_codes.length === 0 ? (
              <p className="text-xs text-danger-text mt-1 font-semibold">No trade selected yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {application.skill_codes.map((code) => (
                  <span
                    key={code}
                    className="rounded-full bg-navy-100 px-3 py-1 text-xs font-bold text-navy-800 border border-navy-200"
                  >
                    {skillNameMap.get(code) ?? code}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-text-muted uppercase">Accepted Job Types</span>
            <p className="text-xs text-text-secondary mt-0.5 font-semibold">
              {application.service_variant_ids.length} job service variants selected
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Service Areas */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">3. Travel & Service Areas</h2>
          </div>
          {isEditable(application) && (
            <Link
              href="/apply/areas"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-signal-700 underline underline-offset-4"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
          )}
        </div>

        <div className="mt-4">
          {application.service_area_ids.length === 0 ? (
            <p className="text-xs text-danger-text font-semibold">No service area selected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {application.service_area_ids.map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-bold text-text border border-line flex items-center gap-1"
                >
                  <MapPin className="h-3 w-3 text-signal-500" />
                  <span>{areaNameMap.get(id) ?? `Zone ${id.slice(0, 8)}`}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Documents */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">4. Verification Documents</h2>
          </div>
          {isEditable(application) && (
            <Link
              href="/apply/documents"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-signal-700 underline underline-offset-4"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {documents.length === 0 ? (
            <p className="text-xs text-danger-text font-semibold">No documents uploaded yet.</p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-control bg-surface-sunken p-2.5 border border-line text-xs font-semibold"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-text" />
                  <span className="capitalize">{doc.kind.replace(/_/g, " ").toLowerCase()}</span>
                </div>
                <Badge tone={doc.status === "APPROVED" ? "success" : "info"}>
                  {doc.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 5: Agreements */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-signal-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text">5. Platform Agreements</h2>
          </div>
          {isEditable(application) && (
            <Link
              href="/apply/consent"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-signal-700 underline underline-offset-4"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
          )}
        </div>

        <div className="mt-3">
          {activeConsents.length > 0 ? (
            <ul className="space-y-1 text-xs text-text-secondary">
              {activeConsents.map((consent) => (
                <li key={consent.id} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />
                  <span>Accepted {consent.purpose.replace(/_/g, " ")} (v{consent.document_version})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-warning-text font-semibold">
              Partner agreements not accepted yet.
            </p>
          )}
        </div>
      </div>

      {/* Submission Actions */}
      {isEditable(application) && (
        <div className="rounded-card border border-line bg-surface p-6 shadow-md mt-2">
          {isVersionConflict(submit.error) ? (
            <ErrorState
              inline
              className="mb-4"
              severity="warning"
              title="Your application changed in another session"
              message="We have reloaded the latest data. Please check and submit again."
            />
          ) : submit.isError ? (
            <ErrorState
              inline
              className="mb-4"
              title="We could not submit your application"
              message="Nothing was lost. Please verify all sections above and try again."
              reference={
                submit.error instanceof ApiRequestError ? submit.error.requestId : null
              }
            />
          ) : null}

          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-line-strong text-signal-500 accent-signal-500"
              />
              <span className="text-xs text-text-secondary leading-relaxed">
                I certify that all the information provided is accurate and truthful. I understand that my profile and documents will be reviewed by V Solve Hub Operations before activation.
              </span>
            </label>

            <div className="flex items-center gap-3">
              <Link href="/apply/schedule" className="shrink-0">
                <Button variant="outline" size="lg" className="font-bold text-sm h-12 px-5">
                  Back
                </Button>
              </Link>
              <Button
                size="lg"
                disabled={!ready || !confirmed}
                loading={submit.isPending}
                loadingLabel="Submitting Application…"
                onClick={() => submit.mutate()}
                className="font-bold gap-2 text-base shadow-md flex-1"
              >
                <Send className="h-4 w-4" />
                <span>Submit Application for Review</span>
              </Button>
            </div>

            <p className="text-xs text-center text-text-muted">
              {ready
                ? "Approval typically completes within 24 hours."
                : `Please complete all ${outstanding.length} required items above to submit.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
