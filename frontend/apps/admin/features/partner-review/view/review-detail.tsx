"use client";

import Link from "next/link";
import { describeError, useCurrentSession } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Field, Spinner, Textarea } from "@vsolve/ui";
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  History,
  Package,
  UserCheck,
  Wrench,
} from "lucide-react";
import { useState } from "react";


import {
  availableActions,
  canSubmitDecision,
  type ReviewAction,
} from "../model/decisions";
import {
  isClaimedElsewhere,
  isSelfReview,
  isVersionConflict,
  useApplicationDetail,
  useClaimApplication,
  useReleaseApplication,
  useTransitionApplication,
} from "../queries";
import { getApiClient } from "@/lib/api/browser";

import { DocumentReveal } from "./document-reveal";

/**
 * One application, and the decisions a reviewer may take on it.
 *
 * ## Claim before decide
 *
 * The decision controls stay disabled until this reviewer holds the record.
 * Ownership is the mechanism that stops two people deciding the same
 * application, and a UI that let you act without claiming would make it
 * decorative.
 *
 * ## Post-approval actions are open to any reviewer
 *
 * Suspend, offboard, and reinstate are platform management actions that any
 * reviewer can take once an application has been decided.
 *
 * ## Conflicts are shown, never resolved silently
 *
 * Every command carries the version the reviewer was looking at. A `409` means
 * someone else acted first, so the application is refetched and the reviewer
 * decides again against what is now true.
 */

const TRACK_CONFIG: Record<
  string,
  { label: string; icon: typeof Wrench; description: string }
> = {
  SERVICES: {
    label: "Home services",
    icon: Wrench,
    description: "Travels to customer homes for trades and repair jobs.",
  },
  STAY_HOST: {
    label: "Stays host",
    icon: Building2,
    description: "Lists rooms, PG, or accommodation properties.",
  },
  RENTAL_OWNER: {
    label: "Rental equipment",
    icon: Package,
    description: "Rents tools, machinery, and equipment.",
  },
  EMPLOYER: {
    label: "Workforce & projects",
    icon: Briefcase,
    description: "Commercial workforce and crew assignments.",
  },
};


const STATUS_TONES: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  CHANGES_REQUIRED: "warning",
  APPROVED: "success",
  DECLINED: "danger",
  SUSPENDED: "danger",
  OFFBOARDED: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUIRED: "Changes requested",
  APPROVED: "Approved",
  DECLINED: "Declined",
  SUSPENDED: "Suspended",
  OFFBOARDED: "Offboarded",
};

export function ReviewDetail({ applicationId }: { applicationId: string | null }) {
  const detail = useApplicationDetail(applicationId);
  const claim = useClaimApplication();
  const release = useReleaseApplication();
  const transition = useTransitionApplication();
  const session = useCurrentSession(getApiClient());

  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  if (applicationId === null) {
    return (
      <Card className="p-6 text-center">
        <UserCheck className="mx-auto h-8 w-8 text-text-muted" />
        <h3 className="mt-2 text-base font-bold text-text">No application selected</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Choose an application from the queue on the left to inspect documents and make a review decision.
        </p>
      </Card>
    );
  }

  if (detail.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-text-secondary text-sm">
        <Spinner size="sm" />
        <span>Loading application details…</span>
      </div>
    );
  }

  if (detail.isError) {
    return (
      <ErrorState
        title={
          isSelfReview(detail.error)
            ? "You cannot open your own record"
            : "We could not load this application"
        }
        message={
          isSelfReview(detail.error)
            ? "This is your own Partner application. Someone else has to review it."
            : "Nothing has changed. Check your connection and try again."
        }
        actionLabel={isSelfReview(detail.error) ? undefined : "Try again"}
        onAction={isSelfReview(detail.error) ? undefined : () => void detail.refetch()}
      />
    );
  }

  const application = detail.data;
  // Ownership matters only while the application waits for review: that is when
  // the server lets the holder alone decide. Suspend and reinstate, later, are
  // open to any reviewer.
  const inReview = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const assignedTo = inReview ? application.review_assigned_to_id : null;
  const myId = session.data?.user?.id ?? null;
  const isMine = assignedTo !== null && assignedTo === myId;
  const heldByOther = assignedTo !== null && !isMine;
  const canRelease = assignedTo !== null;
  const actions = !inReview || isMine ? availableActions(application.status) : [];

  const nonSupersededDocs = application.documents.filter((d) => d.status !== "SUPERSEDED");
  const approvedDocs = nonSupersededDocs.filter((d) => d.status === "APPROVED");
  const pendingDocs = nonSupersededDocs.filter((d) => d.status === "PENDING");
  const rejectedDocs = nonSupersededDocs.filter((d) => d.status === "REJECTED");

  // Document verification conditions:
  // 1. Must have at least 1 document uploaded
  // 2. Government photo ID must be approved (the platform requirement)
  // 3. No documents may remain pending
  // 4. No documents may be in rejected status
  // 5. All uploaded non-superseded documents must be approved
  const hasGovIdApproved =
    nonSupersededDocs.length === 0 ||
    nonSupersededDocs.some(
      (d) => d.kind === "GOVERNMENT_ID" && d.status === "APPROVED",
    );
  const hasDocuments = nonSupersededDocs.length > 0;
  const allRequiredApproved =
    hasDocuments &&
    hasGovIdApproved &&
    pendingDocs.length === 0 &&
    rejectedDocs.length === 0 &&
    approvedDocs.length === nonSupersededDocs.length;

  const trackInfo = TRACK_CONFIG[application.track] ?? {
    label: application.track,
    icon: Wrench,
    description: "Partner service provider.",
  };
  const TrackIcon = trackInfo.icon;

  return (
    <div className="flex flex-col gap-5 p-1 sm:p-2 pb-12">
      {/* 1. Applicant Profile Card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-text">{application.display_name}</h2>
              <span className="flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-text-secondary border border-line">
                <TrackIcon className="h-3.5 w-3.5" />
                <span>{trackInfo.label}</span>
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              Version v{application.version} · {application.experience_years} years experience
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[application.status] ?? "neutral"}>
              {STATUS_LABELS[application.status] ?? application.status}
            </Badge>

            <Link
              href={`/operations/partners`}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2 py-1 text-xs font-semibold text-text-secondary hover:text-text hover:bg-surface-hover"
              title="Open in Partners Directory"
            >
              <span>Directory</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Biography */}
        {application.biography ? (
          <p className="mt-3 text-sm leading-relaxed text-text bg-surface-sunken p-3 rounded-control border border-line">
            &ldquo;{application.biography}&rdquo;
          </p>
        ) : null}

        {/* Timestamps & Review Assignment Metadata */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 border-t border-line pt-3 text-xs">
          <div>
            <span className="text-text-muted block">Submitted:</span>
            <span className="font-semibold text-text">
              {application.submitted_at ? (
                <time dateTime={application.submitted_at}>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(application.submitted_at))}
                </time>
              ) : (
                "Not yet"
              )}
            </span>
          </div>

          <div>
            <span className="text-text-muted block">Reviewed:</span>
            <span className="font-semibold text-text">
              {application.reviewed_at ? (
                <time dateTime={application.reviewed_at}>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(application.reviewed_at))}
                </time>
              ) : (
                "Awaiting decision"
              )}
            </span>
          </div>

          <div>
            <span className="text-text-muted block">Reviewer assignment:</span>
            <span className="font-semibold text-text">
              {isMine ? (
                <span className="text-success-text font-bold">Assigned to you</span>
              ) : heldByOther ? (
                <span className="text-warning-text font-bold">Claimed by another</span>
              ) : (
                <span className="text-text-secondary">Unassigned</span>
              )}
            </span>
          </div>
        </div>

        {/* Ownership Controls */}
        {heldByOther ? (
          <div className="mt-4 rounded-control bg-warning-surface p-3 border border-warning-line text-xs text-warning-text">
            <p className="font-semibold">Another reviewer currently holds this application.</p>
            <p className="mt-0.5 text-text-secondary">
              If they are away or unreachable, release it back to the queue to re-assign or claim it.
            </p>
          </div>
        ) : null}

        {inReview && !isMine && !heldByOther ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-action-surface/30 p-3 border border-action/20">
            <div>
              <p className="text-xs font-bold text-navy-900">This application is open for review.</p>
              <p className="text-xs text-text-secondary">
                Claim this application to inspect KYC documents and take decisions.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() =>
                claim.mutate({
                  applicationId: application.id,
                  expectedVersion: application.version,
                })
              }
              loading={claim.isPending}
              loadingLabel="Claiming…"
            >
              Claim this application
            </Button>
          </div>
        ) : null}

        {canRelease ? (
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
            <span className="text-xs text-text-muted">
              {isMine
                ? "You hold this application. Done reviewing or step away?"
                : "Application is assigned to another reviewer."}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                release.mutate({
                  applicationId: application.id,
                  expectedVersion: application.version,
                })
              }
              loading={release.isPending}
              loadingLabel="Releasing…"
              className="text-xs"
            >
              Release to queue
            </Button>
          </div>
        ) : null}

        {release.isError ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-danger-text">
            {describeError(release.error, "mutation").message}
          </p>
        ) : null}

        {claim.isError ? (
          <ErrorState
            inline
            className="mt-3"
            severity="warning"
            title={
              isSelfReview(claim.error)
                ? "You cannot claim your own record"
                : isClaimedElsewhere(claim.error)
                  ? "Someone else claimed it first"
                  : "We could not claim it"
            }
            message={
              isSelfReview(claim.error)
                ? "Someone else has to review this one."
                : "The queue has been refreshed so you can see who holds it."
            }
          />
        ) : null}
      </Card>

      {/* 2. Changes Requested Banner */}
      {application.change_request_message ? (
        <Card className="border-warning-line bg-warning-surface p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-warning-text mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-warning-text">
                Changes Requested From Partner
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text">
                &ldquo;{application.change_request_message}&rdquo;
              </p>
              {application.status === "CHANGES_REQUIRED" ? (
                <p className="mt-2 text-[11px] font-medium text-warning-text">
                  Waiting for applicant to upload replacement documents or update application and resubmit.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* 3. Partner Skills, Services, Coverage & Consents */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-text uppercase tracking-wider text-text-secondary">
          Trade Profile & Platform Consents
        </h3>

        {application.track === "SERVICES" ? (
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            {/* Skills */}
            <div className="rounded-control bg-surface-sunken p-3 border border-line">
              <span className="font-bold text-text block mb-1.5">Trade Skills</span>
              {(application.skill_codes ?? []).length === 0 ? (
                <span className="text-text-muted">None specified</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(application.skill_codes ?? []).map((skill) => (
                    <span
                      key={skill}
                      className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary border border-line"
                    >
                      {skill.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Services */}
            <div className="rounded-control bg-surface-sunken p-3 border border-line">
              <span className="font-bold text-text block mb-1">Services Offered</span>
              <span className="text-base font-extrabold text-navy-900">
                {(application.service_variant_ids ?? []).length}
              </span>
              <span className="text-text-muted text-[11px] ml-1">services enabled</span>
            </div>

            {/* Service Areas */}
            <div className="rounded-control bg-surface-sunken p-3 border border-line">
              <span className="font-bold text-text block mb-1">Coverage Areas</span>
              <span className="text-base font-extrabold text-navy-900">
                {(application.service_area_ids ?? []).length}
              </span>
              <span className="text-text-muted text-[11px] ml-1">service areas</span>
            </div>
          </div>
        ) : (
          <div className="rounded-control bg-surface-sunken p-3 border border-line text-xs">
            <span className="font-bold text-text block mb-1">{trackInfo.label} Track</span>
            <p className="text-text-secondary">{trackInfo.description}</p>
          </div>
        )}

        {/* Consents / Agreements */}
        <div className="border-t border-line pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-text-secondary">
            <FileCheck className="h-4 w-4 text-success-text" />
            <span>Platform terms & agreements:</span>
            <span className="font-bold text-text">
              {(application.consents ?? []).length > 0
                ? `${(application.consents ?? []).length} agreements accepted`
                : "Pending signature"}
            </span>
          </span>
        </div>
      </Card>

      {/* 4. KYC Documents Section */}
      <section aria-labelledby="documents-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="documents-title" className="text-base font-bold text-text">
              KYC Documents
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              Review and verify applicant identity documents. All required documents must be approved before granting approval.
            </p>
          </div>
          <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800 border border-line">
            Documents: {approvedDocs.length} approved, {pendingDocs.length} pending
            {rejectedDocs.length > 0 ? `, ${rejectedDocs.length} rejected` : ""}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {nonSupersededDocs.length === 0 ? (
            <Card className="p-4 text-center text-xs text-text-secondary">
              No KYC documents have been uploaded yet.
            </Card>
          ) : (
            nonSupersededDocs.map((document) => (
              <DocumentReveal
                key={document.id}
                document={document}
                applicationId={application.id}
                canReview={isMine}
              />
            ))
          )}
        </div>
      </section>

      {/* 5. Audit History / Transitions Trail */}
      {(application.transitions ?? []).length > 0 ? (
        <Card className="p-4">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-xs font-bold text-text hover:text-action"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              <span>Review Audit Trail ({(application.transitions ?? []).length} events)</span>
            </span>
            <span className="text-[11px] font-semibold text-text-secondary">
              {showHistory ? "Hide" : "Show"}
            </span>
          </button>

          {showHistory ? (
            <div className="mt-3 border-t border-line pt-3">
              <ol className="space-y-2.5">
                {(application.transitions ?? []).map((t) => (

                  <li key={t.id} className="text-xs border-l-2 border-line pl-3 py-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text">
                        {STATUS_LABELS[t.from_status] ?? t.from_status} →{" "}
                        {STATUS_LABELS[t.to_status] ?? t.to_status}
                      </span>
                      <span className="text-text-muted text-[11px]">
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(t.occurred_at))}
                      </span>
                    </div>
                    {t.reason ? (
                      <p className="mt-1 text-text-secondary font-mono text-[11px] bg-surface-sunken p-1.5 rounded">
                        {t.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* 6. Operations Decision Card */}
      {actions.length > 0 ? (
        <Card className="p-5">
          <h3 className="text-base font-bold text-text">Decision</h3>

          {/* Status hints about document verification state */}
          {pendingDocs.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-warning-text flex items-center gap-1.5 bg-warning-surface p-2.5 rounded-control border border-warning-line">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Review and decide on all pending documents above before making an approval decision.</span>
            </p>
          ) : rejectedDocs.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-danger-text flex items-center gap-1.5 bg-danger-bg p-2.5 rounded-control border border-danger-border">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>One or more documents were rejected. Click &quot;Request changes&quot; below to send reasons to the applicant.</span>
            </p>
          ) : !hasDocuments ? (
            <p className="mt-2 text-xs font-medium text-warning-text flex items-center gap-1.5 bg-warning-surface p-2.5 rounded-control border border-warning-line">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Required KYC documents have not been uploaded.</span>
            </p>
          ) : allRequiredApproved ? (
            <p className="mt-2 text-xs font-medium text-success-text flex items-center gap-1.5 bg-success-surface p-2.5 rounded-control border border-success-line">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>All documents verified and approved. Application is ready for final approval.</span>
            </p>
          ) : null}

          {isVersionConflict(transition.error) ? (
            <ErrorState
              inline
              className="mt-3"
              severity="warning"
              title="Someone else acted first"
              message="We have reloaded the application. Check what changed before deciding again — your decision was not applied."
            />
          ) : transition.isError ? (
            <ErrorState
              inline
              className="mt-3"
              title={
                isSelfReview(transition.error)
                  ? "You cannot decide your own record"
                  : "We could not record that decision"
              }
              message={
                isSelfReview(transition.error)
                  ? "Someone else has to review this one."
                  : describeError(transition.error, "mutation").message
              }
            />
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((entry) => {
              const isApprove = entry.target === "APPROVED";
              const isApproveDisabled = isApprove && !allRequiredApproved;
              // During review: reviewer must hold it AND approve requires all docs.
              // Post-approval (APPROVED / SUSPENDED): open to any operator!
              const isDisabled = inReview ? !isMine || isApproveDisabled : false;

              return (
                <Button
                  key={entry.target}
                  variant={isApprove ? "primary" : entry.tone === "danger" ? "danger" : "outline"}
                  disabled={isDisabled}
                  title={
                    isApproveDisabled
                      ? "All required KYC documents must be verified and approved first"
                      : !isMine && inReview
                        ? "Claim this application before deciding"
                        : undefined
                  }
                  onClick={() => {
                    setAction(entry);
                    if (entry.target === "CHANGES_REQUIRED" && rejectedDocs.length > 0) {
                      const reasons = rejectedDocs
                        .map(
                          (d) =>
                            `${d.kind.replace(/_/g, " ")}: ${d.review_reason || "Needs clearer replacement"}`,
                        )
                        .join("\n");
                      setReason(reasons);
                    } else {
                      setReason("");
                    }
                  }}
                >
                  {entry.label}
                </Button>
              );
            })}
          </div>

          {inReview && !isMine ? (
            <p className="mt-2 text-sm text-text-secondary">
              Claim this application before deciding.
            </p>
          ) : null}

          {action ? (
            <div className="mt-4 rounded-control bg-surface-sunken p-4 border border-line">
              <Field
                label={`Reason for ${action.label.toLowerCase()}`}
                description={
                  action.requiresReason
                    ? "This note is sent directly to the Partner, so state clearly what needs correction."
                    : "Optional note recorded in the audit trail."
                }
                required={action.requiresReason}
                error={undefined}
              >
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    action.target === "CHANGES_REQUIRED"
                      ? "Specify what the applicant needs to correct or re-upload…"
                      : "Reason for this decision…"
                  }
                />
              </Field>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={!canSubmitDecision(action, reason)}
                  loading={transition.isPending}
                  loadingLabel="Recording…"
                  variant={action.tone === "danger" ? "danger" : "primary"}
                  onClick={() =>
                    transition.mutate(
                      {
                        applicationId: application.id,
                        targetStatus: action.target,
                        expectedVersion: application.version,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      },
                      { onSuccess: () => setAction(null) },
                    )
                  }
                >
                  Confirm {action.label.toLowerCase()}
                </Button>
                <Button variant="ghost" onClick={() => setAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

