"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, buttonStyles, ErrorState, Spinner, useT, type Translator } from "@vsolve/ui";
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

const REQUIRED: readonly { kind: DocumentKind; labelKey: string; whyKey: string }[] = [
  {
    kind: "GOVERNMENT_ID",
    labelKey: "apply.requirements.governmentId",
    whyKey: "apply.documents.why.governmentId",
  },
  {
    kind: "ADDRESS_PROOF",
    labelKey: "apply.requirements.addressProof",
    whyKey: "apply.documents.why.addressProof",
  },
];

function statusTone(
  status: Schemas["PartnerDocumentStatusEnum"],
  t: Translator["t"],
): { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: string } {
  switch (status) {
    case "PENDING":
      return { tone: "info", label: t("apply.documents.status.pending") };
    case "APPROVED":
      return { tone: "success", label: t("apply.documents.status.approved") };
    case "REJECTED":
      return { tone: "danger", label: t("apply.documents.status.rejected") };
    case "SUPERSEDED":
      return { tone: "neutral", label: t("apply.documents.status.superseded") };
  }
}

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
  const t = useT();
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        {t("apply.documents.loading")}
      </p>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title={t("apply.documents.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
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
      <div className="grid gap-4 sm:grid-cols-2">
        {REQUIRED.map((required) => {
          const document = application ? currentDocument(application, required.kind) : null;
          const status = document ? statusTone(document.status, t) : null;
          const label = t(required.labelKey);

          return (
            <div key={required.kind} className="rounded-control border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-navy-900">
                  {label} <span className="text-danger-text">*</span>
                </p>
                <Badge tone={status?.tone ?? "neutral"}>
                  {status?.label ?? t("apply.documents.notUploaded")}
                </Badge>
              </div>

              {document?.status === "REJECTED" ? (
                <p className="mt-2 text-xs font-semibold text-danger-text">
                  {document.review_reason || t("apply.documents.rejectedGenericReason")}
                </p>
              ) : null}

              {document ? (
                <p className="mt-2 text-xs text-text-muted">
                  {t("apply.documents.versionUploadedPrefix", { version: document.version })}{" "}
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
                  label={label}
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
                    ? t("apply.documents.lockedReviewing")
                    : t("apply.documents.notRequiredAnymore")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation actions */}
      <div className="flex items-center justify-between pt-4 border-t border-line gap-3">
        <Link href="/apply/consent" className={buttonStyles({ variant: "outline", size: "lg", className: "shrink-0 font-bold text-sm h-12 px-5" })}>
            {t("common.back")}
          </Link>
        <Link href={isListingTrack(query.data?.track) ? "/apply/review" : "/apply/schedule"} className={buttonStyles({ size: "lg", className: "font-bold text-sm h-12 px-5 shadow-md" })}>
            {isListingTrack(query.data?.track) ? t("apply.documents.continueReview") : t("apply.documents.continueHours")}
          </Link>
      </div>
    </div>
  );
}
