"use client";

import { Badge, Button, ErrorState } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { isSelfReview, useRevealDocument } from "../queries";

/**
 * One KYC document, masked until a reviewer asks for it.
 *
 * ## Masked by default is the whole design
 *
 * The document is never rendered on load. A reviewer presses Reveal, Django
 * issues a short-lived URL and records the access, and the image appears. That
 * ordering is what makes the audit trail complete: an automatic fetch would
 * log a disclosure for every row a reviewer scrolled past, which is both a
 * privacy problem and a useless audit.
 *
 * ## The URL is not kept
 *
 * It lives in component state, dies when the panel closes, and is never written
 * to a query cache or storage. Hiding the document drops it immediately rather
 * than keeping it "in case they look again" — a second look is a second
 * disclosure, and should be recorded as one.
 *
 * ## A pending scan is not a viewable document
 *
 * Django gates access behind the malware scan. Offering Reveal before the scan
 * finishes would produce a refusal a reviewer cannot act on, so the control
 * explains the wait instead.
 */

type Document = Schemas["PartnerDocument"];

const KIND_LABELS: Record<Schemas["PartnerDocumentKindEnum"], string> = {
  GOVERNMENT_ID: "Government photo ID",
  ADDRESS_PROOF: "Proof of address",
  TAX: "Tax document",
  BANK: "Bank document",
  BACKGROUND_CHECK: "Background check",
  OTHER: "Document",
};

export function DocumentReveal({ document }: { document: Document }) {
  const reveal = useRevealDocument();
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const isScanned = document.scan_status === "CLEAN";
  const isPdf = document.content_type === "application/pdf";

  async function handleReveal() {
    const access = await reveal.mutateAsync(document.id).catch(() => null);
    if (access) setReviewUrl(access.review_url);
  }

  function handleHide() {
    // Dropped rather than cached: looking again is a new disclosure and has to
    // be audited as one.
    setReviewUrl(null);
    reveal.reset();
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-text">{KIND_LABELS[document.kind]}</p>
        <div className="flex items-center gap-2">
          <Badge tone={document.status === "APPROVED" ? "success" : "neutral"}>
            {document.status.toLowerCase().replace(/_/g, " ")}
          </Badge>
          {!isScanned ? (
            <Badge tone={document.scan_status === "PENDING" ? "info" : "danger"}>
              {document.scan_status.toLowerCase()}
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-1 text-sm text-text-muted">
        Version {document.version} · {document.content_type}
      </p>

      {!isScanned ? (
        <p className="mt-3 text-sm text-text-secondary">
          {document.scan_status === "PENDING"
            ? "This file is still being checked for malware. It cannot be opened until that finishes."
            : "This file failed its safety check and cannot be opened. Ask the Partner to upload it again."}
        </p>
      ) : reviewUrl === null ? (
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={() => void handleReveal()}
            loading={reveal.isPending}
            loadingLabel="Requesting access"
          >
            Reveal document
          </Button>
          <p className="mt-2 text-xs text-text-muted">
            Opening this is recorded against your account.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          {isPdf ? (
            <iframe
              src={reviewUrl}
              title={`${KIND_LABELS[document.kind]} for review`}
              className="h-96 w-full rounded-control border border-line"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reviewUrl}
              alt={`${KIND_LABELS[document.kind]} submitted for review`}
              className="max-h-96 w-auto max-w-full rounded-control border border-line"
            />
          )}
          <Button variant="ghost" size="sm" className="mt-2" onClick={handleHide}>
            Hide document
          </Button>
        </div>
      )}

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
              ? "This is your own Partner application. Someone else has to review it — that is not something access can be granted for."
              : "Nothing was disclosed. Try again, or ask another reviewer to take this one."
          }
        />
      ) : null}
    </div>
  );
}
