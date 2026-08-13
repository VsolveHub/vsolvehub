"use client";

import { Button, Card, ErrorState, Field, Textarea } from "@vsolve/ui";
import {
  ACCEPTED_EVIDENCE_MEDIA_TYPES,
  EVIDENCE_UPLOAD_KINDS,
  MAXIMUM_EVIDENCE_PER_STAGE,
  describeError,
  evidenceKindForFile,
  isStageTransitionNotAllowed,
  rejectEvidenceFile,
  submissionCount,
  type Engagement,
  type EngagementStage,
} from "@vsolve/query";
import { Paperclip, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import {
  useSubmitStageEvidence,
  useUploadStageEvidence,
  type EvidenceUploadProgress,
} from "../queries";
import type { StageWording } from "../model/engagement-copy";
import { EvidenceHistory } from "./evidence-history";

/**
 * Attach what was done, then hand the stage to the customer — `M2-FE-603`.
 *
 * Upload progress, retry, a declaration and the history, in one place because
 * they are one act: a vendor standing on site finishes, photographs it, writes a
 * line and sends it.
 *
 * ## The note is not a caption
 *
 * `submit/`'s `note` is **required** and is stored as its own append-only `NOTE`
 * evidence row rather than as a column on the stage. That is why the declaration
 * sits above the submit button rather than beside the file picker: it is the
 * vendor's account of what they did, it survives a correction cycle, and it is
 * read in a dispute years later. Attaching files without submitting leaves them
 * on the stage and does **not** start the customer's review clock — stated in
 * those words, because the opposite assumption loses a vendor a day.
 *
 * ## Resubmitting restarts the review window from zero
 *
 * Said on the screen, because it is the answer to "should I resubmit?" — the
 * customer is looking at different evidence, so they get a full window against
 * it. The idempotency key is scoped to the stage **and** the number of
 * submissions already on it, so a retry of one submission replays and a
 * deliberate resubmission after a correction is a new logical command rather
 * than a replay of the first.
 *
 * ## `NOTE` is not an upload kind
 *
 * The file picker offers photos, video and PDFs. `StageEvidenceKindEnum` contains
 * `NOTE` and the server's media-type table does not, so presigning a `NOTE` is
 * refused with "that evidence type is not supported". A kind is never chosen by
 * the vendor at all — it is derived from the file's own media type, which is what
 * the server checks anyway.
 */

const ACCEPT_ATTRIBUTE = EVIDENCE_UPLOAD_KINDS.flatMap(
  (kind) => ACCEPTED_EVIDENCE_MEDIA_TYPES[kind],
).join(",");

export interface EvidenceComposerProps {
  readonly engagement: Engagement;
  readonly stage: EngagementStage;
  readonly wording: StageWording;
  /** False while the stage is past the point evidence attaches. */
  readonly canAttach: boolean;
  readonly canSubmit: boolean;
}

export function EvidenceComposer({
  engagement,
  stage,
  wording,
  canAttach,
  canSubmit,
}: EvidenceComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<EvidenceUploadProgress | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteProblem, setNoteProblem] = useState<string | null>(null);

  const upload = useUploadStageEvidence(engagement.id);
  const submit = useSubmitStageEvidence(engagement.id);

  const alreadySubmitted = submissionCount(stage);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be chosen again after a failure,
    // which browsers otherwise treat as "no change" and silently ignore.
    event.target.value = "";
    if (!file) return;

    setRejection(null);
    const refusal = rejectEvidenceFile({ file, existingCount: stage.evidence.length });
    if (refusal) {
      setRejection(refusal.message);
      return;
    }

    const kind = evidenceKindForFile(file.type);
    if (kind === null) {
      // `rejectEvidenceFile` has already covered this; the guard is here so the
      // kind reaching the request is never widened by a future edit.
      setRejection("That file cannot be attached. Photos, video and PDFs only.");
      return;
    }

    setProgress({ phase: "hashing", percent: 0 });
    upload.mutate(
      { stageId: stage.id, kind, file, onProgress: setProgress },
      { onSettled: () => setProgress(null) },
    );
  }

  function onSubmit() {
    const trimmed = note.trim();
    if (trimmed === "") {
      setNoteProblem(`Say what was done on this ${wording.one} before you send it.`);
      return;
    }
    setNoteProblem(null);
    submit.mutate(
      { stageId: stage.id, note: trimmed, submissionOrdinal: alreadySubmitted },
      { onSuccess: () => setNote("") },
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-text">What you did</h2>
        <p className="text-sm leading-6 text-text-secondary">
          {canAttach
            ? `Attach photos, video or a PDF, then write what was done. Attaching a file on its own does not send this ${wording.one} for review — the customer's clock starts when you press send.`
            : `This ${wording.one} no longer takes new evidence. What is below is what the customer sees.`}
        </p>
      </header>

      <EvidenceHistory stage={stage} />

      {canAttach ? (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={onPick}
            disabled={upload.isPending}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending || stage.evidence.length >= MAXIMUM_EVIDENCE_PER_STAGE}
            icon={<Paperclip size={16} aria-hidden />}
          >
            Attach a file
          </Button>

          <p className="text-xs text-text-muted">
            Photos up to 12 MB, video up to 80 MB, PDFs up to 20 MB. Up to{" "}
            {MAXIMUM_EVIDENCE_PER_STAGE} files on one {wording.one}.
          </p>

          {progress ? <UploadProgressBar progress={progress} /> : null}

          {rejection ? (
            <p role="alert" className="text-sm text-danger-text">
              {rejection}
            </p>
          ) : null}

          {upload.isError ? (
            <UploadFailure
              error={upload.error}
              onRetry={() => fileInput.current?.click()}
              wording={wording}
            />
          ) : null}
        </div>
      ) : null}

      {canSubmit ? (
        <div className="flex flex-col gap-2">
          <Field
            label={alreadySubmitted === 0 ? "What was done" : "What you changed"}
            description={
              alreadySubmitted === 0
                ? "The customer reads this when they decide. It is kept on the record."
                : "Your first account stays on the record. This is added beside it, not over it."
            }
            error={noteProblem ?? undefined}
          >
            <Textarea
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={`What you finished on this ${wording.one}`}
            />
          </Field>

          <p className="text-xs leading-5 text-text-muted">
            By sending this you are declaring the work described was completed as agreed.
            {alreadySubmitted === 0
              ? ""
              : " Sending again gives the customer a fresh review window from now, because they are looking at different evidence."}
          </p>

          <Button
            type="button"
            onClick={onSubmit}
            loading={submit.isPending}
            loadingLabel="Sending for review"
            icon={<Upload size={16} aria-hidden />}
          >
            Send for review
          </Button>

          {submit.isError ? <SubmitFailure error={submit.error} wording={wording} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function UploadProgressBar({ progress }: { readonly progress: EvidenceUploadProgress }) {
  const label = {
    hashing: "Checking the file",
    requesting: "Asking Vsolve for a slot",
    uploading: "Uploading",
    finalizing: "Confirming it arrived",
    done: "Attached",
  }[progress.phase];

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full bg-action transition-[width]"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-text-muted">
        {label}
        {progress.phase === "uploading" ? ` · ${progress.percent}%` : ""}
      </p>
    </div>
  );
}

/**
 * Why an upload failed, and whether trying again can help.
 *
 * Three genuinely different answers. Storage being down is retryable and nothing
 * was lost. An expired grant is retryable and needs a fresh one, which choosing
 * the file again does. A rejection is **not** retryable with the same bytes:
 * Django fetched the stored object back and compared it with the intent, and
 * resending cannot change that comparison.
 */
function UploadFailure({
  error,
  onRetry,
  wording,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly wording: StageWording;
}) {
  const failure = error as { reason?: string; message?: string };
  const reason = failure.reason ?? "unknown";

  if (reason === "not_accepting") {
    return (
      <ErrorState
        title={`This ${wording.one} moved`}
        message={`It no longer accepts evidence — the customer or a clock has acted since this screen loaded. Reload to see where it got to.`}
        severity="warning"
      />
    );
  }

  if (reason === "rejected") {
    return (
      <ErrorState
        title="Vsolve could not accept that file"
        message={`${failure.message ?? "The file did not arrive as described."} Sending the same file again will not help — try a different one.`}
        severity="warning"
      />
    );
  }

  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      title={reason === "storage" ? "Vsolve's file storage is not answering" : presentation.title}
      message={
        reason === "storage" || reason === "expired" || reason === "network"
          ? "Nothing was lost. Choose the file again."
          : presentation.message
      }
      severity="warning"
      actionLabel="Choose the file again"
      onAction={onRetry}
      reference={presentation.reference}
    />
  );
}

/** A refused submission. The two 409s mean the stage moved; re-read, never resend. */
function SubmitFailure({
  error,
  wording,
}: {
  readonly error: unknown;
  readonly wording: StageWording;
}) {
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={`This ${wording.one} moved`}
        message={`Somebody — or a review clock — acted on it since this screen loaded, so it is no longer waiting to be sent. Reload to see where it got to. Sending again would send it against the state that just refused.`}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
