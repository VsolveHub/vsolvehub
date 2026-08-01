"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { usePartnerApplication } from "../queries";

/**
 * The documents a reviewer will look at.
 *
 * Read-only for now, and that is a contract boundary rather than a design
 * choice. `POST /api/v1/partner/application/documents/` registers *metadata* —
 * `object_key`, `content_type`, `size_bytes`, `sha256` — for a file that some
 * other mechanism has already put in storage. Nothing issues the signed upload
 * URL that would produce those values, so a file picker here could only invent
 * an object key, and a Partner would be told their ID was uploaded when no
 * bytes exist.
 *
 * So this shows what is on file, what a reviewer said about it, and says plainly
 * that uploading is not open. The upload itself is FE-CLAUDE-04, behind D6/G10.
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

  return (
    <section>
      <h1 className="text-xl font-bold text-text sm:text-2xl">Documents</h1>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
        Two documents are needed before a reviewer can approve you. They are
        stored privately and are only ever seen by a reviewer.
      </p>

      <div
        role="status"
        className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4"
      >
        <p className="text-sm text-text">
          Uploading is not open yet. We are finishing the secure upload, and we
          will not ask you for a document until it is ready.
        </p>
      </div>

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
                <p className="mt-2 text-sm text-text-muted">
                  Version {document.version}, uploaded{" "}
                  <time dateTime={document.uploaded_at}>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(document.uploaded_at))}
                  </time>
                </p>
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
