"use client";

import { Badge, ErrorState } from "@vsolve/ui";
import { UploadCloud } from "lucide-react";
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

  const [isDragging, setIsDragging] = useState(false);

  const isBusy = upload.isPending;
  const inputId = `upload-${kind.toLowerCase()}`;

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isBusy || expectedVersion === null) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const problem = rejectFile(file);
    if (problem) {
      setRejection(problem.message);
      setPendingFile(null);
      return;
    }

    setRejection(null);
    setPendingFile(file);
    void send(file);
  }

  return (
    <div className="mt-3">
      <label
        htmlFor={inputId}
        className="block text-sm font-bold text-text mb-1"
      >
        {replacing ? `Replace your ${label.toLowerCase()}` : `Upload your ${label.toLowerCase()}`}
      </label>

      {/* Modern Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isBusy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled && !isBusy && expectedVersion !== null) {
            inputRef.current?.click();
          }
        }}
        className={[
          "relative flex flex-col items-center justify-center rounded-card border-2 border-dashed p-5 text-center cursor-pointer transition-all",
          isDragging
            ? "border-signal-500 bg-signal-50/50 scale-[1.01]"
            : "border-line-strong bg-surface hover:border-signal-400 hover:bg-surface-sunken",
          disabled || isBusy || expectedVersion === null
            ? "opacity-60 cursor-not-allowed"
            : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_CONTENT_TYPES.join(",")}
          disabled={disabled || isBusy || expectedVersion === null}
          onChange={handleChange}
          className="sr-only"
        />

        <div className="grid h-10 w-10 place-items-center rounded-full bg-navy-50 text-navy-700 mb-2">
          <UploadCloud className="h-5 w-5 text-signal-500" />
        </div>

        {/*
          Device-neutral verb, and the drag-and-drop half is desktop-only.
          Applicants photograph an ID on a phone — there is nothing to drag
          there, and "Click" names an input a phone does not have. The hint
          returns at `sm:` where a pointer actually exists.
        */}
        <p className="text-sm font-bold text-navy-900">
          <span className="text-signal-700 underline underline-offset-2">Choose a file</span>
          <span className="hidden sm:inline"> or drag & drop here</span>
        </p>
        <p className="text-xs text-text-muted mt-1">
          Supports clear photo (JPG, PNG) or PDF document (up to {formatBytes(20 * 1024 * 1024)})
        </p>
      </div>

      {rejection ? (
        <p role="alert" className="mt-2 text-xs font-bold text-danger-text">
          ⚠️ {rejection}
        </p>
      ) : null}

      {isBusy ? (
        <div className="mt-3 rounded-card bg-surface-sunken p-3 border border-line" aria-live="polite">
          <div className="flex items-center justify-between text-xs font-semibold text-text">
            <span>{PHASE_LABEL[progress.phase]}</span>
            <span>{progress.phase === "uploading" ? `${progress.percent}%` : ""}</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === "uploading" ? progress.percent : undefined}
            aria-label={`${label} upload`}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
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
        <p role="status" className="mt-3 flex items-center gap-2 text-xs font-bold text-success-text">
          <Badge tone="success">Uploaded</Badge>
          <span>File received securely. A reviewer will verify this during review.</span>
        </p>
      ) : null}
    </div>
  );
}
