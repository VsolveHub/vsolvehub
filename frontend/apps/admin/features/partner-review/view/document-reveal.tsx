"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState } from "@vsolve/ui";
import { AlertCircle, Check, Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";

import { isSelfReview, useRevealDocument, useReviewDocument } from "../queries";

type Document = Schemas["PartnerDocument"];

const KIND_LABELS: Record<Schemas["PartnerDocumentKindEnum"], string> = {
  GOVERNMENT_ID: "Government photo ID",
  ADDRESS_PROOF: "Proof of address",
  TAX: "Tax document",
  BANK: "Bank document",
  BACKGROUND_CHECK: "Background check",
  OTHER: "Document",
};

const COMMON_REJECTION_REASONS = [
  "Document is blurry or illegible",
  "Expired document",
  "Name does not match application",
  "Incorrect document type",
  "Address does not match application",
];

export interface DocumentRevealProps {
  document: Document;
  applicationId: string;
  canReview: boolean;
}

export function DocumentReveal({
  document,
  applicationId,
  canReview,
}: DocumentRevealProps) {
  const reveal = useRevealDocument();
  const review = useReviewDocument();

  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  const isPdf = document.content_type === "application/pdf";

  async function handleReveal() {
    const access = await reveal.mutateAsync(document.id).catch(() => null);
    if (access) setReviewUrl(access.review_url);
  }

  function handleHide() {
    setReviewUrl(null);
    reveal.reset();
  }

  async function handleApprove() {
    setReviewError(null);
    try {
      await review.mutateAsync({
        applicationId,
        documentId: document.id,
        decision: "APPROVED",
      });
      setIsRejecting(false);
    } catch {
      setReviewError("Could not approve this document. Please try again.");
    }
  }

  async function handleConfirmReject() {
    if (!reason.trim()) {
      setReviewError("A rejection reason is required.");
      return;
    }
    setReviewError(null);
    try {
      await review.mutateAsync({
        applicationId,
        documentId: document.id,
        decision: "REJECTED",
        reason: reason.trim(),
      });
      setIsRejecting(false);
      setReason("");
    } catch {
      setReviewError("Could not record rejection. Please try again.");
    }
  }

  const isPendingReview = document.status === "PENDING";
  const isApproved = document.status === "APPROVED";
  const isRejected = document.status === "REJECTED";

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-sm">
      {/* Header with Title, Version and Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-bold text-navy-900">{KIND_LABELS[document.kind]}</p>
          <span className="rounded bg-navy-50 px-1.5 py-0.5 text-xs font-semibold text-navy-700">
            v{document.version}
          </span>
        </div>

        <Badge
          tone={
            isApproved
              ? "success"
              : isRejected
                ? "danger"
                : "info"
          }
        >
          {isApproved
            ? "Approved"
            : isRejected
              ? "Changes requested"
              : "Waiting for review"}
        </Badge>
      </div>

      {/* Document Metadata */}
      <p className="mt-1 text-xs text-text-muted">
        {document.content_type} • Uploaded{" "}
        <time dateTime={document.uploaded_at}>
          {new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date(document.uploaded_at))}
        </time>
      </p>

      {/* Rejection Reason if Rejected */}
      {isRejected && document.review_reason ? (
        <div className="mt-2.5 rounded-control bg-danger-bg p-2.5 border border-danger-border text-xs text-danger-text">
          <p className="font-bold flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Rejection reason given:
          </p>
          <p className="mt-1">{document.review_reason}</p>
        </div>
      ) : null}

      {/* Document Reveal / Preview Area */}
      {reviewUrl === null ? (
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReveal()}
            loading={reveal.isPending}
            loadingLabel="Opening…"
            className="flex items-center gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Reveal document</span>
          </Button>

          <p className="text-[11px] text-text-muted">
            Access is recorded for audit.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-control border border-line p-2 bg-surface-sunken">
          {isPdf ? (
            <iframe
              src={reviewUrl}
              title={`${KIND_LABELS[document.kind]} for review`}
              className="h-96 w-full rounded border border-line bg-surface"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reviewUrl}
              alt={`${KIND_LABELS[document.kind]} submitted for review`}
              className="max-h-96 w-auto max-w-full rounded border border-line mx-auto"
            />
          )}
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text"
              onClick={handleHide}
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span>Hide document</span>
            </Button>
          </div>
        </div>
      )}

      {/* Reveal Error */}
      {reveal.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title={
            isSelfReview(reveal.error)
              ? "You cannot open your own record"
              : "We could not open that document"
          }
          message={
            isSelfReview(reveal.error)
              ? "This is your own Partner application. Someone else has to review it."
              : "Nothing was disclosed. Try again or check storage access."
          }
        />
      ) : null}

      {/* Document Review Decisions (Approve / Reject) */}
      <div className="mt-4 pt-3 border-t border-line">
        {canReview ? (
          isRejecting ? (
            <div className="flex flex-col gap-2 rounded-control bg-surface-sunken p-3 border border-line">
              <p className="text-xs font-bold text-navy-900">
                Reason for rejecting {KIND_LABELS[document.kind].toLowerCase()}:
              </p>

              {/* Quick Reason Suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_REJECTION_REASONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setReason(suggestion)}
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors border",
                      reason === suggestion
                        ? "bg-navy-900 text-white border-navy-900"
                        : "bg-surface text-navy-800 border-line hover:border-navy-400",
                    ].join(" ")}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Type specific reason for applicant..."
                rows={2}
                className="w-full rounded border border-line bg-surface p-2 text-xs text-text focus:outline-none focus:border-signal-500"
              />

              <div className="flex items-center justify-end gap-2 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsRejecting(false);
                    setReason("");
                    setReviewError(null);
                  }}
                  disabled={review.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleConfirmReject()}
                  loading={review.isPending}
                  loadingLabel="Rejecting…"
                  disabled={!reason.trim()}
                  className="flex items-center gap-1 font-bold"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Confirm Rejection</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-text-muted">
                {isPendingReview
                  ? "Action required on this document:"
                  : isApproved
                    ? "Verified & approved."
                    : "Sent back for replacement."}
              </span>

              <div className="flex items-center gap-2">
                {/* Approve Button */}
                {!isApproved ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleApprove()}
                    loading={review.isPending}
                    loadingLabel="Approving…"
                    className="flex items-center gap-1.5 font-bold"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Approve Document</span>
                  </Button>
                ) : null}

                {/* Reject Button */}
                {!isRejected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsRejecting(true);
                      setReason("");
                    }}
                    disabled={review.isPending}
                    className="flex items-center gap-1.5 text-danger-text hover:bg-danger-bg hover:border-danger-border"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject Document</span>
                  </Button>
                ) : null}
              </div>
            </div>
          )
        ) : (
          <p className="text-xs text-text-muted">
            {isPendingReview
              ? "Claim this application to review and approve this document."
              : isApproved
                ? "Document is approved."
                : "Document was rejected."}
          </p>
        )}

        {/* Review Error Display */}
        {reviewError ? (
          <div className="mt-2 text-xs font-semibold text-danger-text bg-danger-bg p-2 rounded border border-danger-border flex items-center justify-between">
            <span>{reviewError}</span>
            <button
              type="button"
              onClick={() => setReviewError(null)}
              className="underline ml-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
