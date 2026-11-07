"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState, useT, type Translator } from "@vsolve/ui";
import { Eye, RefreshCw, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import {
  currentDocument,
  documentLabelKey,
  documentStatusPresentation,
  isDocumentRejected,
} from "../model/status";
import {
  ACCEPTED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isRetryableUploadFailure,
  rejectFile,
  type UploadProgress,
} from "../model/upload";
import {
  UploadFailure,
  usePartnerDocumentAccess,
  useUploadDocument,
  type DocumentKind,
} from "../upload-queries";

type Application = Schemas["PartnerApplication"];

/**
 * One document kind: what is on file, what the reviewer said, and the upload control when — and
 * only when — the server says a new file is allowed.
 *
 * `can_edit` decides whether a missing kind may be uploaded; each document's own `can_replace`
 * decides whether it may be replaced. Both are the rule the upload endpoint enforces, so this
 * never offers an upload the API refuses — a declined application shows its rejected document
 * and its reason, and no button.
 *
 * Used by the documents step and by the hub's "what we need from you" list.
 */
export function DocumentSlot({
  application,
  kind,
  required,
  hintKey,
}: {
  application: Application;
  kind: DocumentKind;
  required: boolean;
  hintKey?: string;
}) {
  const t = useT();
  const document = currentDocument(application, kind);
  const [replacing, setReplacing] = useState(false);
  const label = t(documentLabelKey(kind));
  const rejected = document !== null && isDocumentRejected(document);
  const canReplace = document?.can_replace ?? false;
  const showUploader =
    document === null ? application.can_edit : canReplace && (rejected || replacing);
  const isLockedForReview =
    document !== null &&
    !canReplace &&
    (application.status === "SUBMITTED" || application.status === "UNDER_REVIEW");
  const badge = document ? documentStatusPresentation(document) : null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">{label}</p>
          <p className="text-xs text-text-secondary">
            {required ? t("common.required") : t("common.optional")}
          </p>
        </div>
        <Badge tone={badge?.tone ?? "neutral"}>
          {badge ? t(badge.labelKey) : t("apply.documents.notUploaded")}
        </Badge>
      </div>

      {hintKey && (document === null || rejected) ? (
        <p className="text-xs text-text-secondary">{t(hintKey)}</p>
      ) : null}

      {document && rejected ? (
        <p className="rounded-control border border-danger-line bg-danger-surface p-3 text-sm text-text">
          {document.scan_status === "REJECTED"
            ? t("apply.documents.scanFailed")
            : t("apply.documents.reason", {
                reason: document.review_reason || t("apply.uploadedCard.rejectedFallback"),
              })}
        </p>
      ) : null}

      {document ? (
        <FileRow
          document={document}
          onReplace={canReplace && !rejected && !replacing ? () => setReplacing(true) : undefined}
        />
      ) : null}

      {showUploader ? (
        <DocumentUpload
          kind={kind}
          label={label}
          expectedVersion={application.version}
          replacing={document !== null}
          onSuccess={() => setReplacing(false)}
          onCancel={replacing ? () => setReplacing(false) : undefined}
        />
      ) : null}

      {isLockedForReview ? (
        <p className="text-xs text-text-muted">{t("apply.documents.lockedReviewing")}</p>
      ) : null}
    </div>
  );
}

function FileRow({
  document,
  onReplace,
}: {
  document: Schemas["PartnerDocument"];
  onReplace?: () => void;
}) {
  const t = useT();
  const access = usePartnerDocumentAccess();
  const [accessError, setAccessError] = useState<string | null>(null);

  async function view() {
    setAccessError(null);
    try {
      const response = await access.mutateAsync(document.id);
      if (response.access_url) {
        window.open(response.access_url, "_blank", "noopener,noreferrer");
      } else {
        setAccessError(t("apply.uploadedCard.noPreviewLink"));
      }
    } catch {
      setAccessError(t("apply.uploadedCard.openFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{document.file_name}</p>
          <p className="truncate text-xs text-text-secondary">
            {formatBytes(document.size_bytes)} ·{" "}
            <time dateTime={document.uploaded_at}>
              {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
                new Date(document.uploaded_at),
              )}
            </time>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void view()}
            loading={access.isPending}
            loadingLabel={t("apply.uploadedCard.opening")}
          >
            <Eye className="h-4 w-4" aria-hidden />
            {t("apply.uploadedCard.view")}
          </Button>
          {onReplace ? (
            <Button variant="ghost" size="sm" onClick={onReplace}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("apply.uploadedCard.replace")}
            </Button>
          ) : null}
        </div>
      </div>
      {accessError ? (
        <p role="alert" className="text-xs font-semibold text-danger-text">
          {accessError}
        </p>
      ) : null}
    </div>
  );
}

function phaseLabel(phase: UploadProgress["phase"], t: Translator["t"]): string {
  switch (phase) {
    case "idle":
      return "";
    case "hashing":
      return t("apply.upload.phase.hashing");
    case "requesting":
      return t("apply.upload.phase.requesting");
    case "uploading":
      return t("apply.upload.phase.uploading");
    case "finalizing":
      return t("apply.upload.phase.finalizing");
    case "done":
      return t("apply.upload.phase.done");
    case "failed":
      return t("apply.upload.phase.failed");
  }
}

interface DocumentUploadProps {
  kind: DocumentKind;
  label: string;
  expectedVersion: number;
  replacing: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

/**
 * The file picker and transfer for one document.
 *
 * Nothing about the file outlives the attempt: the `File`, the signed URL and the upload token
 * live in this component only. Retry is offered only when sending the same bytes again can work
 * (an expired link or a dropped connection), never for a file the server refused.
 */
function DocumentUpload({
  kind,
  label,
  expectedVersion,
  replacing,
  onSuccess,
  onCancel,
}: DocumentUploadProps) {
  const t = useT();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle", percent: 0 });
  const [rejection, setRejection] = useState<string | null>(null);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isBusy = upload.isPending;
  const inputId = `upload-${kind.toLowerCase()}`;

  async function send(file: File) {
    setFailure(null);
    setRejection(null);
    try {
      await upload.mutateAsync({ kind, file, expectedVersion, onProgress: setProgress });
      setPendingFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onSuccess();
    } catch (error) {
      setProgress({ phase: "failed", percent: 0 });
      setFailure(
        error instanceof UploadFailure
          ? error
          : new UploadFailure("unknown", t("apply.upload.failure.unknownMessage")),
      );
    }
  }

  function accept(file: File | undefined) {
    if (!file) return;
    const problem = rejectFile(file, t);
    if (problem) {
      setRejection(problem.message);
      setPendingFile(null);
      // Cleared so choosing the same corrected file fires a change.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setRejection(null);
    setPendingFile(file);
    void send(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-semibold text-text">
          {replacing
            ? t("apply.upload.replaceLabel", { label: label.toLowerCase() })
            : t("apply.upload.uploadLabel", { label: label.toLowerCase() })}
        </label>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-text-secondary underline hover:text-text"
          >
            {t("common.cancel")}
          </button>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!isBusy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!isBusy) accept(event.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!isBusy) inputRef.current?.click();
        }}
        className={[
          "relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed p-4 sm:p-5 text-center transition-colors",
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
          isDragging ? "border-action bg-action-surface" : "border-line-strong bg-surface hover:bg-surface-hover",
          isBusy ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_CONTENT_TYPES.join(",")}
          disabled={isBusy}
          onChange={(event) => accept(event.target.files?.[0])}
          className="sr-only"
        />
        <UploadCloud className="h-6 w-6 text-action" aria-hidden />
        <p className="text-sm font-semibold text-text">
          {replacing ? t("apply.upload.reupload") : t("apply.upload.chooseFile")}
        </p>
        <p className="text-xs text-text-muted">
          {t("apply.upload.supportHint", { size: formatBytes(MAX_UPLOAD_BYTES) })}
        </p>
      </div>

      {rejection ? (
        <p role="alert" className="text-xs font-bold text-danger-text">
          {rejection}
        </p>
      ) : null}

      {isBusy ? (
        <div className="rounded-control border border-line bg-surface-sunken p-3" aria-live="polite">
          <div className="flex items-center justify-between text-xs font-semibold text-text">
            <span>{phaseLabel(progress.phase, t)}</span>
            <span>{progress.phase === "uploading" ? `${progress.percent}%` : ""}</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === "uploading" ? progress.percent : undefined}
            aria-label={t("apply.upload.ariaLabel", { label })}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <span
              className="block h-full bg-action transition-[width] duration-200"
              style={{ width: progress.phase === "uploading" ? `${progress.percent}%` : "100%" }}
            />
          </div>
        </div>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          severity={failure.reason === "rejected" ? "error" : "warning"}
          title={
            failure.reason === "expired"
              ? t("apply.upload.failure.expiredTitle")
              : failure.reason === "conflict"
                ? t("apply.upload.failure.conflictTitle")
                : failure.reason === "rejected"
                  ? t("apply.upload.failure.rejectedTitle")
                  : t("apply.upload.failure.unknownTitle")
          }
          message={failure.message}
          actionLabel={
            isRetryableUploadFailure(failure.reason) && pendingFile ? t("common.tryAgain") : undefined
          }
          onAction={
            isRetryableUploadFailure(failure.reason) && pendingFile
              ? () => void send(pendingFile)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
