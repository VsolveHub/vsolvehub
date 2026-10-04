"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { isListingTrack } from "../model/steps";
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
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        Loading documents…
      </p>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="Could not load documents"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;
  const isEditable =
    application === null ||
    application.status === "DRAFT" ||
    application.status === "CHANGES_REQUIRED";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {REQUIRED.map((required) => {
          const document = application ? currentDocument(application, required.kind) : null;
          const status = document ? STATUS_TONE[document.status] : null;

          return (
            <div key={required.kind} className="rounded-control border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-navy-900">
                  {required.label} <span className="text-danger-text">*</span>
                </p>
                <Badge tone={status?.tone ?? "neutral"}>
                  {status?.label ?? "Not uploaded"}
                </Badge>
              </div>

              {document?.status === "REJECTED" ? (
                <p className="mt-2 text-xs font-semibold text-danger-text">
                  {document.review_reason || "Document could not be verified. Please upload a clear photo or PDF."}
                </p>
              ) : null}

              {document ? (
                <p className="mt-2 text-xs text-text-muted">
                  Version {document.version} • Uploaded{" "}
                  <time dateTime={document.uploaded_at}>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(document.uploaded_at))}
                  </time>
                </p>
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
              ) : (
                /*
                  A locked application still draws the required marker and, when
                  a kind was never supplied, the words "Not uploaded" — with no
                  picker underneath and, until now, nothing saying why. On a
                  phone that reads as a broken screen: a starred requirement, an
                  unmet status and no control. Say which of the two it is.
                */
                <p className="mt-2 text-xs text-text-muted">
                  {document
                    ? "Locked while your application is being reviewed."
                    : "This was not required when your application was approved. Contact support if you need to add it."}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation actions */}
      <div className="flex items-center justify-between pt-4 border-t border-line gap-3">
        <Link href="/apply/consent" className="shrink-0">
          <Button variant="outline" size="lg" className="font-bold text-sm h-12 px-5">
            Back
          </Button>
        </Link>
        <Link href={isListingTrack(query.data?.track) ? "/apply/review" : "/apply/schedule"}>
          <Button size="lg" className="font-bold text-sm h-12 px-5 shadow-md">
            {isListingTrack(query.data?.track) ? "Continue to review" : "Continue to Working Hours"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
