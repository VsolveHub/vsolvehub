"use client";

import { AttachmentList, Button, Field, Textarea } from "@vsolve/ui";
import { useRef } from "react";

import { toAttachmentItems } from "../adapters";
import { useRequirement } from "./requirement-context";

/**
 * Screen 3 — Details.
 *
 * ## Voice is a fast path, not an accessory
 *
 * `FLOW-04` and `GAP-007` put voice *beside* the structured questions as an
 * equal option: "record 30 seconds instead of answering questions". It leads this
 * screen for that reason. A Customer describing a leaking pipe in Telugu at 9pm
 * should not have to translate themselves into our form first, and the language
 * they use is captured because matching routes on it — a vendor who cannot read
 * the requirement cannot quote it.
 *
 * ## Uploads report their own truth
 *
 * The shared `AttachmentList` renders progress, failure and removal from one row
 * per file, and `scanning` deliberately maps to `uploading` rather than to
 * `attached`: a file that has left the device but not cleared the malware scan is
 * not attached yet, and showing it as attached is how someone submits believing a
 * photo went with it.
 */

export interface DetailsScreenProps {
  /**
   * Opens the OS file picker result. Upload is server-signed; this only reports
   * intent.
   *
   * Null when there is nowhere to upload to, which is the state today:
   * `POST /requirements/{id}/attachments/` is `M2-BE-202` and deferred to Wave
   * C1. Nullable rather than absent, on the same pattern as `onRecordVoice`, so
   * the screen renders one honest explanation instead of a control that opens a
   * file picker and then loses the file.
   */
  onAttachFiles: ((files: FileList) => void) | null;
  onRemoveAttachment: (id: string) => void;
  onRetryAttachment: (id: string) => void;
  /** Starts or stops the voice recorder. Null disables the fast path. */
  onRecordVoice: (() => void) | null;
  isRecording?: boolean;
}

export function DetailsScreen({
  onAttachFiles,
  onRemoveAttachment,
  onRetryAttachment,
  onRecordVoice,
  isRecording = false,
}: DetailsScreenProps) {
  const { state, dispatch } = useRequirement();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Anything that helps</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        All of this is optional. A photo or a voice note usually gets you a more
        accurate quote than a form does.
      </p>

      {onRecordVoice !== null ? (
        <div className="mt-5 rounded-card border border-action-line bg-action-surface p-4">
          <p className="font-semibold text-text">Rather just talk?</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Record about 30 seconds describing what you need, in whichever
            language you are comfortable with. We will pass it to professionals
            who speak it.
          </p>
          <Button className="mt-3" onClick={onRecordVoice} aria-pressed={isRecording}>
            {isRecording ? "Stop recording" : "Record a voice note"}
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="text-sm font-semibold text-text">Photos, video or documents</p>

        {onAttachFiles === null ? (
          // Not a placeholder and not a disabled button. The upload command does
          // not exist, so the honest thing is to say so once and point at the
          // field below that does work — a greyed-out "Add files" would leave
          // the Customer guessing whether it was them or us.
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Attaching files is not available yet. Describe anything you would have
            photographed in the box below — professionals read it, and you can add
            photos later once we have asked you to.
          </p>
        ) : (
          <>
            <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
              Professionals see these only after they accept your request. Please
              avoid including documents with personal identity details.
            </p>

            <input
              ref={fileInput}
              type="file"
              multiple
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
            >
              Add files
            </Button>

            <div className="mt-4">
              <AttachmentList
                label="Attached to this request"
                items={toAttachmentItems(state.attachments)}
                onRemove={onRemoveAttachment}
                onRetry={onRetryAttachment}
                empty={
                  <p className="text-sm text-text-secondary">
                    Nothing attached yet. This is optional.
                  </p>
                }
              />
            </div>
          </>
        )}
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
