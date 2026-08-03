"use client";

import { Badge, ErrorState } from "@vsolve/ui";
import { useRef, useState } from "react";

import {
  ACCEPTED_CONTENT_TYPES,
  formatBytes,
  isRetryableUploadFailure,
  rejectFile,
  type UploadProgress,
} from "../model/upload";
import { UploadFailure, useUploadDocument, type DocumentKind } from "../upload-queries";

/**
 * Uploading one kind of KYC document.
 *
 * ## Nothing about the file is kept
 *
 * The `File`, its bytes, the signed URL and the upload token all live in this
 * component for the length of one attempt. None is written to storage, logged,
 * or placed in a query cache. The only thing that outlives the upload is the
 * document record Django returns, which carries metadata and no content.
 *
 * ## Retry means "send the same bytes again"
 *
 * A signed URL expires; a checksum mismatch does not become correct on a second
 * try. So a failure says which of those happened, and Retry is offered only for
 * the first — the whole flow re-runs from the request step, getting a fresh URL,
 * because the old one is exactly what went stale.
 *
 * ## A clean upload is not an approved document
 *
 * Django scans before a reviewer can open it. `PENDING` scan and `PENDING`
 * review are different waits and are shown as different things: a Partner who
 * reads "uploaded" as "accepted" stops chasing the one that was rejected.
 */

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  idle: "",
  hashing: "Checking the file…",
  requesting: "Preparing a secure upload…",
  uploading: "Uploading…",
  finalizing: "Confirming with our server…",
  done: "Uploaded",
  failed: "Upload failed",
};

export interface DocumentUploadProps {
  kind: DocumentKind;
  label: string;
  expectedVersion: number | null;
  /** Set when a reviewer rejected the previous version of this document. */
  replacing?: boolean;
  disabled?: boolean;
}

export function DocumentUpload({
  kind,
  label,
  expectedVersion,
  replacing = false,
  disabled = false,
}: DocumentUploadProps) {
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle", percent: 0 });
  const [rejection, setRejection] = useState<string | null>(null);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  async function send(file: File) {
    if (expectedVersion === null) return;

    setFailure(null);
    setRejection(null);

    try {
      await upload.mutateAsync({
        kind,
        file,
        expectedVersion,
        onProgress: setProgress,
      });
      // The file is no longer needed the moment Django has it.
      setPendingFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setProgress({ phase: "failed", percent: 0 });
      setFailure(
        error instanceof UploadFailure
          ? error
          : new UploadFailure("unknown", "The upload did not complete."),
      );
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const problem = rejectFile(file);
    if (problem) {
      setRejection(problem.message);
      setPendingFile(null);
      // Clear the input so choosing the same corrected file fires a change.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setRejection(null);
    setPendingFile(file);
    void send(file);
  }

  const isBusy = upload.isPending;
  const inputId = `upload-${kind.toLowerCase()}`;

  return (
    <div className="mt-3">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-text"
      >
        {replacing ? `Replace your ${label.toLowerCase()}` : `Upload your ${label.toLowerCase()}`}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_CONTENT_TYPES.join(",")}
        disabled={disabled || isBusy || expectedVersion === null}
        onChange={handleChange}
        className="mt-2 block w-full text-sm text-text-secondary file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-action file:px-4 file:font-semibold file:text-action-text hover:file:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
      />

      <p className="mt-1 text-xs text-text-muted">
        A photo or PDF, up to {formatBytes(20 * 1024 * 1024)}. Make sure all four
        corners and the text are readable.
      </p>

      {rejection ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
          {rejection}
        </p>
      ) : null}

      {isBusy ? (
        <div className="mt-3" aria-live="polite">
          <p className="text-sm text-text-secondary">
            {PHASE_LABEL[progress.phase]}
            {progress.phase === "uploading" ? ` ${progress.percent}%` : ""}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === "uploading" ? progress.percent : undefined}
            aria-label={`${label} upload`}
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <span
              className="block h-full bg-action transition-[width] duration-200"
              style={{
                width: progress.phase === "uploading" ? `${progress.percent}%` : "100%",
              }}
            />
          </div>
        </div>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          className="mt-3"
          severity={failure.reason === "rejected" ? "error" : "warning"}
          title={
            failure.reason === "expired"
              ? "That upload link expired"
              : failure.reason === "conflict"
                ? "Your application changed while uploading"
                : failure.reason === "rejected"
                  ? "We could not accept that file"
                  : "The upload did not finish"
          }
          message={
            failure.reason === "rejected"
              ? "The file did not match what we expected. Choose the document again — a clear photo of the original usually works."
              : failure.reason === "conflict"
                ? "Nothing was uploaded. Reload this page to pick up the latest version, then try again."
                : "Nothing was uploaded. Check your connection and try again."
          }
          actionLabel={
            isRetryableUploadFailure(failure.reason) && pendingFile ? "Try again" : undefined
          }
          onAction={
            isRetryableUploadFailure(failure.reason) && pendingFile
              ? () => void send(pendingFile)
              : undefined
          }
        />
      ) : null}

      {upload.isSuccess && progress.phase === "done" ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm">
          <Badge tone="info">Uploaded</Badge>
          <span className="text-text-secondary">
            We are checking the file. A reviewer sees it once that finishes.
          </span>
        </p>
      ) : null}
    </div>
  );
}
