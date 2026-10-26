"use client";

import { describeError, useCurrentSession } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Field, Spinner, Textarea } from "@vsolve/ui";
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
 * ## Conflicts are shown, never resolved silently
 *
 * Every command carries the version the reviewer was looking at. A `409` means
 * someone else acted first, so the application is refetched and the reviewer
 * decides again against what is now true — the one thing that must not happen is
 * a second decision landing on top of a first without anyone choosing it.
 *
 * ## Self-review has its own words
 *
 * "You cannot review your own record" is not a permission that can be granted,
 * so it must not read like one. Telling someone to ask their team lead would
 * send them to a person who cannot help.
 */

export function ReviewDetail({ applicationId }: { applicationId: string | null }) {
  const detail = useApplicationDetail(applicationId);
  const claim = useClaimApplication();
  const release = useReleaseApplication();
  const transition = useTransitionApplication();
  const session = useCurrentSession(getApiClient());

  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");

  if (applicationId === null) {
    return (
      <Card className="p-5">
        <p className="text-sm text-text-secondary">
          Choose an application from the queue to review it.
        </p>
      </Card>
    );
  }

  if (detail.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading the application…
      </p>
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
  // Mine only when it names me. Treating any holder as "mine" showed decision
  // buttons on someone else's review that the server would refuse.
  const isMine = assignedTo !== null && assignedTo === myId;
  const heldByOther = assignedTo !== null && !isMine;
  const canRelease = assignedTo !== null;
  const actions = !inReview || isMine ? availableActions(application.status) : [];

  const nonSupersededDocs = application.documents.filter((d) => d.status !== "SUPERSEDED");
  const approvedDocs = nonSupersededDocs.filter((d) => d.status === "APPROVED");
  const pendingDocs = nonSupersededDocs.filter((d) => d.status === "PENDING");
  const rejectedDocs = nonSupersededDocs.filter((d) => d.status === "REJECTED");

  const hasRequiredDocs = nonSupersededDocs.length >= 2;
  const allRequiredApproved =
    hasRequiredDocs &&
    pendingDocs.length === 0 &&
    rejectedDocs.length === 0 &&
    approvedDocs.length === nonSupersededDocs.length;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-text">{application.display_name}</h2>
          <Badge tone="neutral">
            {application.status.toLowerCase().replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Version {application.version} · {application.experience_years} years experience
        </p>
        {application.biography ? (
          <p className="mt-3 text-sm leading-6 text-text">{application.biography}</p>
        ) : null}

        {heldByOther ? (
          <p className="mt-4 text-sm text-text-secondary">
            Another reviewer holds this application. If they are away, release it to the queue
            and claim it.
          </p>
        ) : null}

        {inReview && !isMine && !heldByOther ? (
          <div className="mt-4">
            <Button
              onClick={() =>
                claim.mutate({
                  applicationId: application.id,
                  expectedVersion: application.version,
                })
              }
              loading={claim.isPending}
              loadingLabel="Claiming"
            >
              Claim this application
            </Button>
            <p className="mt-2 text-sm text-text-secondary">
              Claim it before deciding, so nobody else reviews it at the same time.
            </p>
          </div>
        ) : null}

        {canRelease ? (
          <div className="mt-3">
            <Button
              variant="ghost"
              onClick={() =>
                release.mutate({
                  applicationId: application.id,
                  expectedVersion: application.version,
                })
              }
              loading={release.isPending}
              loadingLabel="Releasing"
            >
              Release to the queue
            </Button>
            {release.isError ? (
              <p role="alert" className="mt-1 text-sm text-danger-text">
                {describeError(release.error, "mutation").message}
              </p>
            ) : null}
          </div>
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

      <section aria-labelledby="documents-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="documents-title" className="text-base font-bold text-text">
              Documents
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              Review and verify each KYC document before approving this application.
            </p>
          </div>
          <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800 border border-line">
            Documents: {approvedDocs.length} approved, {pendingDocs.length} pending
            {rejectedDocs.length > 0 ? `, ${rejectedDocs.length} rejected` : ""}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {nonSupersededDocs.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing has been uploaded yet.</p>
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

      {actions.length > 0 ? (
        <Card className="p-5">
          <h3 className="text-base font-bold text-text">Decision</h3>

          {/* Status hints about document verification state */}
          {pendingDocs.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-warning-text flex items-center gap-1.5">
              <span>⚠️ Approve all required documents before approving this application.</span>
            </p>
          ) : rejectedDocs.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-danger-text flex items-center gap-1.5">
              <span>⚠️ Send the application back to the partner with the rejection reasons.</span>
            </p>
          ) : !hasRequiredDocs ? (
            <p className="mt-2 text-xs font-medium text-warning-text flex items-center gap-1.5">
              <span>⚠️ Required documents are missing.</span>
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
                // The server's own reason — "Approve the latest required documents
                // before approving this application" — is customer-safe by
                // contract and is the only thing that tells a reviewer what to fix.
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
              const isDisabled = !isMine || isApproveDisabled;

              return (
                <Button
                  key={entry.target}
                  variant={isApprove ? "primary" : "outline"}
                  disabled={isDisabled}
                  title={
                    isApproveDisabled
                      ? "All required documents must be approved first"
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

          {!isMine ? (
            <p className="mt-2 text-sm text-text-secondary">
              Claim this application before deciding.
            </p>
          ) : null}

          {action ? (
            <div className="mt-4">
              <Field
                label={`Reason for ${action.label.toLowerCase()}`}
                description={
                  action.requiresReason
                    ? "This reaches the Partner word for word, so say exactly what needs to change."
                    : "Optional. Recorded on the application."
                }
                required={action.requiresReason}
                error={undefined}
              >
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={!canSubmitDecision(action, reason)}
                  loading={transition.isPending}
                  loadingLabel="Recording"
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
