"use client";

import { Button, Field, Textarea } from "@vsolve/ui";
import { useRef } from "react";

import { toAttachmentRows } from "../adapters";
import { MAXIMUM_ATTACHMENTS, PICKER_ACCEPT } from "../model/upload";
import { AttachmentRows } from "./attachment-rows";
import { useRequirement } from "./requirement-context";
import { VoiceNoteRecorder } from "./voice-note-recorder";

/**
 * Screen 3 — Details.
 *
 * ## Voice is a fast path, not an accessory
 *
 * `FLOW-04` and `GAP-007` put voice *beside* the structured questions as an
 * equal option: "record 30 seconds instead of answering questions". It leads
 * this screen for that reason, above the file picker and above the text box, and
 * it carries its own language control because the language is an eligibility
 * input rather than a preference — see `VoiceNoteRecorder`.
 *
 * It is on screen 3 rather than screen 1 because the four-screen budget is a
 * hard constraint (`SCREENS.length === 4`) and screen 1 is where the answers the
 * lifecycle is inferred from are collected. What it must never be is *after* the
 * questions in the sense of being their fallback, which is why it is the first
 * thing on this screen and the questions are not repeated beneath it.
 *
 * ## Uploads report their own truth
 *
 * Every file is judged on its own — a refusal lands on that file's row, never as
 * a banner over the screen, because a page-level error for a picker that took
 * four photographs is what makes somebody remove all four.
 *
 * `checking` is deliberately not `attached`: a file that has left the device but
 * not cleared the malware scan is not attached, and showing it as attached is
 * how someone submits believing a photo went with it.
 *
 * And the retry affordance is decided **per row**. A checksum mismatch is an
 * upload going wrong and offers "Try again"; a file the scan rejected offers
 * only "Remove", because retrying malware is the one thing this screen must
 * never invite.
 */

export interface DetailsScreenProps {
  /**
   * Opens the OS file picker result. Upload is server-signed; this reports the
   * files and the controller owns the handshake.
   */
  onAttachFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onRetryAttachment: (id: string) => void;
  /** A finished recording and the language it was spoken in. */
  onRecordVoice: (blob: Blob, language: string, fileName: string) => void;
  /**
   * False until the server-side draft exists.
   *
   * Attachments hang off a requirement, and `POST .../attachments/uploads/`
   * needs its id. Before screen 1 has been saved there is genuinely nowhere to
   * put a file, and the controls say so rather than accepting one and dropping
   * it.
   */
  canAttach: boolean;
  /** True while a removal is in flight, so a row cannot be pressed twice. */
  isBusy?: boolean;
  previewUrlFor: (id: string) => string | null;
}

export function DetailsScreen({
  onAttachFiles,
  onRemoveAttachment,
  onRetryAttachment,
  onRecordVoice,
  canAttach,
  isBusy = false,
  previewUrlFor,
}: DetailsScreenProps) {
  const { state, dispatch } = useRequirement();
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = toAttachmentRows(state.attachments);
  const remaining = MAXIMUM_ATTACHMENTS - state.attachments.length;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Anything that helps</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        All of this is optional. A photo or a voice note usually gets you a more
        accurate quote than a form does.
      </p>

      <div className="mt-5">
        <VoiceNoteRecorder
          onRecorded={onRecordVoice}
          language={state.language}
          onLanguageChange={(language) => dispatch({ type: "SET_LANGUAGE", language })}
          enabled={canAttach}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-text">Photos, video or documents</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Only the professionals we invite to quote for this request can open
          these, and only once a file has passed our security check. Anyone who
          declines, runs out of time or is not chosen loses access; the
          professional you pick keeps it for the job. Please leave out anything
          with identity details on it — an Aadhaar card or a bank statement is
          never needed to quote for work.
        </p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Photos up to 12 MB, video up to 80 MB, PDFs up to 20 MB.{" "}
          {remaining > 0
            ? `You can attach ${remaining} more.`
            : `You have reached the ${MAXIMUM_ATTACHMENTS}-file limit — remove one to add another.`}
        </p>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={PICKER_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files !== null && event.target.files.length > 0) {
              onAttachFiles(event.target.files);
            }
            // Cleared so re-picking the same file fires `change` again.
            event.target.value = "";
          }}
        />
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          disabled={!canAttach}
        >
          Add files
        </Button>
        {!canAttach ? (
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            Answer the first question and we will save your request — then you can
            attach files to it.
          </p>
        ) : null}

        <div className="mt-4">
          <AttachmentRows
            label="Attached to this request"
            items={rows}
            onRemove={onRemoveAttachment}
            onRetry={onRetryAttachment}
            previewUrlFor={previewUrlFor}
            isBusy={isBusy}
            empty={
              <p className="text-sm text-text-secondary">
                Nothing attached yet. This is optional.
              </p>
            }
          />
        </div>
      </div>

      <div className="mt-6">
        <Field
          label="Anything else we should know?"
          description="Optional. The questions and your voice note are the main thing — this is for whatever they missed."
        >
          <Textarea
            rows={4}
            value={state.additionalDetails}
            onChange={(event) =>
              dispatch({ type: "SET_ADDITIONAL_DETAILS", text: event.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}
