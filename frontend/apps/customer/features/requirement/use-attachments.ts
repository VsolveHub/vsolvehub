"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  useRemoveAttachment,
  useUploadAttachment,
  AttachmentUploadFailure,
  isAlreadyRemoved,
  type AttachmentUploadIntent,
} from "./queries";
import type { RequirementAction } from "./model/machine";
import type { AttachmentFailure, DraftAttachment } from "./model/state";
import {
  classifyPickedFile,
  classifyRecording,
  normalizeContentType,
  type FileRejectionCode,
  type UploadableAttachmentKind,
} from "./model/upload";

/**
 * The uploader's moving parts, kept out of the reducer and out of the screens.
 *
 * ## Why the bytes live here and not in the draft state
 *
 * `RequirementDraftState` is Customer *intent*: it is diffed on every change,
 * written to `sessionStorage`, and restored into a fresh tab. A `Blob` survives
 * none of that, and a reducer holding one would be a reducer whose state cannot
 * be serialised or compared. So the row lives in the reducer and the bytes live
 * in a ref beside it, keyed by the row's local id.
 *
 * That split is also what makes **retry** possible at all. A retry needs the
 * original bytes; the reducer never had them, and re-opening the file picker to
 * recover from a dropped connection would be asking the Customer to fix our
 * network.
 *
 * ## What a row is addressed by
 *
 * Its **local** id, for the whole of its life — the server's attachment id is
 * recorded alongside rather than replacing it. That is the single thing that
 * makes a replayed finalize harmless: Django answers a repeated
 * `Idempotency-Key` with the original `201`, and this hook writes that answer
 * back into the row it already created. A design that keyed rows by the server's
 * id would have nothing to write into until the first success, and would append
 * on the replay.
 *
 * ## Object URLs
 *
 * Created when a row is added and revoked when it is removed or the screen
 * unmounts. A preview that is never revoked is a file held in memory for the
 * life of the tab, which on a phone with four site photographs is the difference
 * between a working form and a reload.
 */

interface PendingBody {
  body: Blob;
  contentType: string;
  kind: UploadableAttachmentKind;
  language: string;
  /** `blob:` URL for the preview, or null for a kind with nothing to show. */
  previewUrl: string | null;
}

const REJECTION_FAILURE: Record<FileRejectionCode, AttachmentFailure> = {
  EMPTY: "EMPTY",
  TOO_LARGE: "TOO_LARGE",
  UNSUPPORTED_TYPE: "UNSUPPORTED_TYPE",
  TOO_MANY: "TOO_MANY",
};

let sequence = 0;
function nextLocalId(): string {
  sequence += 1;
  return `local:${Date.now().toString(36)}:${sequence}`;
}

/** Kinds worth showing back to the person who attached them. */
function previewable(kind: UploadableAttachmentKind): boolean {
  return kind !== "DOCUMENT";
}

export interface AttachmentsController {
  /** The OS picker's result. Each file is judged, and refused, on its own. */
  attachFiles: (files: FileList | readonly File[]) => void;
  /** A finished recording, with the language it was spoken in. */
  attachRecording: (blob: Blob, language: string, fileName: string) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  /** A `blob:` URL for the row's preview, or null when there is nothing to show. */
  previewUrlFor: (localId: string) => string | null;
  /** True while a removal this screen asked for is still in flight. */
  isRemoving: boolean;
}

export interface UseAttachmentsInput {
  /** Null before the draft exists server-side; the picker is closed until it does. */
  requirementId: string | null;
  attachments: readonly DraftAttachment[];
  dispatch: (action: RequirementAction) => void;
}

export function useAttachments({
  requirementId,
  attachments,
  dispatch,
}: UseAttachmentsInput): AttachmentsController {
  const upload = useUploadAttachment();
  const removeAttachment = useRemoveAttachment();

  const bodies = useRef(new Map<string, PendingBody>());
  const intents = useRef(new Map<string, AttachmentUploadIntent>());

  useEffect(() => {
    const held = bodies.current;
    return () => {
      for (const pending of held.values()) {
        if (pending.previewUrl !== null) URL.revokeObjectURL(pending.previewUrl);
      }
      held.clear();
    };
  }, []);

  const send = useCallback(
    (localId: string) => {
      const pending = bodies.current.get(localId);
      if (pending === undefined || requirementId === null) return;

      dispatch({
        type: "UPDATE_ATTACHMENT",
        id: localId,
        patch: { state: "uploading", progress: null, failure: null, failureDetail: null },
      });

      upload.mutate(
        {
          requirementId,
          kind: pending.kind,
          contentType: pending.contentType,
          body: pending.body,
          language: pending.language,
          intent: intents.current.get(localId) ?? null,
          onIntent: (intent) => intents.current.set(localId, intent),
          onProgress: (progress) =>
            dispatch({
              type: "UPDATE_ATTACHMENT",
              id: localId,
              patch: {
                state: "uploading",
                // Only the byte transfer is measurable. Reporting 0% while
                // hashing an 80 MB video reads as a stalled upload, so the row
                // says "preparing" instead — see `AttachmentRows`.
                progress: progress.phase === "uploading" ? progress.percent : null,
              },
            }),
        },
        {
          onSuccess: (attachment) => {
            intents.current.delete(localId);
            dispatch({
              type: "UPDATE_ATTACHMENT",
              id: localId,
              patch: {
                attachmentId: attachment.id,
                // `PENDING` on arrival, always: the object exists and the scan
                // has not run. Not `attached` — that word is reserved for a file
                // a vendor could actually be shown.
                state: "scanning",
                progress: 100,
                failure: null,
                failureDetail: null,
              },
            });
          },
          onError: (error: unknown) => {
            const failure =
              error instanceof AttachmentUploadFailure
                ? error
                : new AttachmentUploadFailure("The upload did not finish.", {
                    retryable: true,
                    bytesStored: false,
                  });
            // A refusal on the file's own merits ends this intent. Keeping it
            // would let a retry replay the same refusal against bytes Django has
            // already judged.
            if (!failure.retryable) intents.current.delete(localId);
            dispatch({
              type: "UPDATE_ATTACHMENT",
              id: localId,
              patch: {
                state: "failed",
                progress: null,
                failure: failure.retryable ? "UPLOAD_FAILED" : "REFUSED",
                // Django's own sentence, carried through rather than re-derived:
                // `m2_attachment_invalid` is one code for five different things
                // to do about it, and the server already wrote which.
                failureDetail: failure.message,
              },
            });
          },
        },
      );
    },
    [dispatch, requirementId, upload],
  );

  const enqueue = useCallback(
    (
      body: Blob,
      kind: UploadableAttachmentKind,
      contentType: string,
      fileName: string,
      language: string,
    ) => {
      const localId = nextLocalId();
      const previewUrl = previewable(kind) ? URL.createObjectURL(body) : null;
      bodies.current.set(localId, { body, contentType, kind, language, previewUrl });

      dispatch({
        type: "ADD_ATTACHMENT",
        attachment: {
          id: localId,
          attachmentId: null,
          kind,
          fileName,
          byteSize: body.size,
          language: language === "" ? null : language,
          state: "queued",
          progress: null,
          failure: null,
          failureDetail: null,
        },
      });
      send(localId);
    },
    [dispatch, send],
  );

  /**
   * A file this client will not send, as a row of its own.
   *
   * The refusal belongs **against the offending file**, not at the top of the
   * screen: a page-level "that did not work" for a picker that took four files
   * is the message that makes somebody remove all four and start again.
   */
  const refuse = useCallback(
    (fileName: string, byteSize: number, code: FileRejectionCode) => {
      dispatch({
        type: "ADD_ATTACHMENT",
        attachment: {
          id: nextLocalId(),
          attachmentId: null,
          // The kind is unknown by definition for an unsupported type; a
          // document is the neutral noun and the row's copy carries the reason.
          kind: "DOCUMENT",
          fileName,
          byteSize,
          language: null,
          state: "failed",
          progress: null,
          failure: REJECTION_FAILURE[code],
          // Refused here, so the client's own copy is the better sentence — it
          // can quote the ceiling the server would only describe.
          failureDetail: null,
        },
      });
    },
    [dispatch],
  );

  const attachFiles = useCallback(
    (files: FileList | readonly File[]) => {
      // Counted along the way rather than read from `attachments` per file: the
      // six photographs a picker returns are judged one after another inside a
      // single render, so the prop is stale from the second one onwards and the
      // thirteenth would never be refused.
      let count = attachments.length;
      for (const file of Array.from(files)) {
        const verdict = classifyPickedFile(file, count);
        count += 1;
        if (!verdict.accepted) {
          refuse(file.name, file.size, verdict.code);
          continue;
        }
        enqueue(file, verdict.file.kind, verdict.file.contentType, file.name, "");
      }
    },
    [attachments.length, enqueue, refuse],
  );

  const attachRecording = useCallback(
    (blob: Blob, language: string, fileName: string) => {
      const verdict = classifyRecording(blob, attachments.length);
      if (!verdict.accepted) {
        refuse(fileName, blob.size, verdict.code);
        return;
      }
      enqueue(blob, "VOICE_NOTE", normalizeContentType(blob.type), fileName, language);
    },
    [attachments.length, enqueue, refuse],
  );

  const retry = useCallback((localId: string) => send(localId), [send]);

  const forget = useCallback((localId: string) => {
    const pending = bodies.current.get(localId);
    if (pending?.previewUrl != null) URL.revokeObjectURL(pending.previewUrl);
    bodies.current.delete(localId);
    intents.current.delete(localId);
  }, []);

  const remove = useCallback(
    (localId: string) => {
      const row = attachments.find((attachment) => attachment.id === localId);
      if (row === undefined) return;

      // Nothing on the server yet: the row is the whole record and dropping it
      // locally is the complete removal.
      if (row.attachmentId === null || requirementId === null) {
        forget(localId);
        dispatch({ type: "REMOVE_ATTACHMENT", id: localId });
        return;
      }

      removeAttachment.mutate(
        { requirementId, attachmentId: row.attachmentId },
        {
          onSuccess: () => {
            forget(localId);
            dispatch({ type: "REMOVE_ATTACHMENT", id: localId });
          },
          onError: (error: unknown) => {
            // Already gone is the outcome that was asked for. Anything else
            // leaves the row alone: it still exists server-side, and dropping it
            // from the screen would tell the Customer a file was removed that
            // a vendor can still be shown.
            if (isAlreadyRemoved(error)) {
              forget(localId);
              dispatch({ type: "REMOVE_ATTACHMENT", id: localId });
            }
          },
        },
      );
    },
    [attachments, dispatch, forget, removeAttachment, requirementId],
  );

  const previewUrlFor = useCallback(
    (localId: string) => bodies.current.get(localId)?.previewUrl ?? null,
    [],
  );

  return {
    attachFiles,
    attachRecording,
    retry,
    remove,
    previewUrlFor,
    isRemoving: removeAttachment.isPending,
  };
}
