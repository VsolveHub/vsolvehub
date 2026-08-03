"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { usePartnerApplication } from "../queries";
import { DocumentUpload } from "./document-upload";

/**
 * The documents a reviewer will look at.
 *
 * Contract 1.5.0 publishes the server-owned signed upload, so this is now the
 * whole flow: what is on file, what a reviewer said about it, and a picker that
 * requests an upload, sends the bytes to private storage and finalizes against
 * a checksum Django recomputes.
 *
 * Two waits are shown separately because they are separate. A scan runs before
 * a reviewer can open the file; review happens after. Collapsing them into
 * "uploaded" is how a Partner stops chasing the one that was rejected.
 */

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

const REQUIRED: readonly { kind: DocumentKind; label: string; why: string }[] = [
  {
    kind: "GOVERNMENT_ID",
    label: "Government photo ID",
    why: "Confirms you are who you say you are before we send you to someone's home.",
  },
  {
    kind: "ADDRESS_PROOF",
    label: "Proof of address",
    why: "Any recent bill or statement showing your name and address.",
  },
];

const STATUS_TONE: Record<
  Schemas["PartnerDocumentStatusEnum"],
  { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: string }
> = {
  PENDING: { tone: "info", label: "Waiting for review" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "Needs replacing" },
  SUPERSEDED: { tone: "neutral", label: "Replaced" },
};

/**
 * The scan gate, which comes before review.
 *
 * `FAILED` is not `REJECTED`: the file was never readable, so the Partner should
 * send it again rather than believe a reviewer looked at it and said no.
 */
const SCAN_TONE: Record<
  Schemas["ScanStatusEnum"],
  { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: string } | null
> = {
  PENDING: { tone: "info", label: "Being checked" },
  CLEAN: null,
  REJECTED: { tone: "danger", label: "File refused" },
  FAILED: { tone: "warning", label: "Check failed" },
};

/** The document that currently counts for a kind: the newest non-superseded one. */
function currentDocument(
  application: Application,
  kind: DocumentKind,
): Schemas["PartnerDocument"] | null {
  const candidates = application.documents
    .filter((document) => document.kind === kind && document.status !== "SUPERSEDED")
    .sort((a, b) => b.version - a.version);
  return candidates[0] ?? null;
}

export function DocumentsStep() {
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading your documents…
      </p>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your documents"
        message="Nothing on file has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;
  // Uploading into an application a reviewer is holding would change what they
  // are looking at mid-decision.
  const isEditable =
    application === null ||
    application.status === "DRAFT" ||
    application.status === "CHANGES_REQUIRED";

  return (
    <section>
      <h1 className="text-xl font-bold text-text sm:text-2xl">Documents</h1>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
        Two documents are needed before a reviewer can approve you. They are
        stored privately and are only ever seen by a reviewer.
      </p>

      <ul className="mt-6 flex list-none flex-col gap-3 p-0">
        {REQUIRED.map((required) => {
          const document = application ? currentDocument(application, required.kind) : null;
          const status = document ? STATUS_TONE[document.status] : null;

          return (
            <li key={required.kind} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-text">{required.label}</p>
                <Badge tone={status?.tone ?? "neutral"}>
                  {status?.label ?? "Not uploaded"}
                </Badge>
              </div>

              <p className="mt-1 text-sm text-text-secondary">{required.why}</p>

              {/* The reviewer's own words. A Partner who is told only "rejected"
                  uploads the same unusable photo again. */}
              {document?.status === "REJECTED" ? (
                <p className="mt-2 text-sm font-medium text-danger-text">
                  {document.review_reason ||
                    "A reviewer could not accept this. Contact support and we will tell you what is needed."}
                </p>
              ) : null}

              {document ? (
                <>
                  {SCAN_TONE[document.scan_status] ? (
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Badge tone={SCAN_TONE[document.scan_status]!.tone}>
                        {SCAN_TONE[document.scan_status]!.label}
                      </Badge>
                      <span className="text-text-secondary">
                        {document.scan_status === "PENDING"
                          ? "A reviewer sees this once the check finishes."
                          : "This file could not be checked. Please upload it again."}
                      </span>
                    </p>
                  ) : null}

                  <p className="mt-2 text-sm text-text-muted">
                    Version {document.version}, uploaded{" "}
                    <time dateTime={document.uploaded_at}>
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeZone: "Asia/Kolkata",
                      }).format(new Date(document.uploaded_at))}
                    </time>
                  </p>
                </>
              ) : null}

              {isEditable ? (
                <DocumentUpload
                  kind={required.kind}
                  label={required.label}
                  expectedVersion={application?.version ?? null}
                  replacing={
                    document?.status === "REJECTED" || document?.scan_status === "REJECTED"
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-6">
        <Link
          href="/apply"
          className="min-h-11 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Back to your application
        </Link>
      </p>
    </section>
  );
}
