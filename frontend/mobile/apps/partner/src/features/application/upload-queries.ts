// Ported from frontend/apps/partner/features/application/upload-queries.ts
import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getApiClient, sha256OfFile, uploadToSignedUrl } from "@vsolve/mobile-core";

import {
  isUploadExpired,
  type UploadFailureReason,
  type UploadProgress,
} from "./model/upload";

/**
 * The three-step signed document upload.
 *
 * Kept as one mutation rather than three, because the steps are not
 * independently useful: an upload requested but never finalized is an orphan
 * Django has to clean up, and a caller who could invoke them separately would
 * eventually leave one behind.
 *
 * ## Why `XMLHttpRequest` for the transfer
 *
 * `fetch` cannot report upload progress — there is no `onprogress` for a request
 * body in any shipping browser. A KYC photo over a phone connection is exactly
 * the case where a progress bar is the difference between waiting and
 * re-tapping, so the byte transfer uses `XMLHttpRequest` and everything else
 * uses the generated client.
 *
 * ## What is never retried automatically
 *
 * Nothing. Finalize is a state-changing command against a version, and the byte
 * transfer can be genuinely expensive; both are retried by an explicit press so
 * the person knows a second attempt is happening.
 */

export type DocumentKind = Schemas["PartnerDocumentKindEnum"];

/** A photo or PDF chosen on the device. Bytes stay in the file the picker returned. */
export interface LocalDocumentFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface UploadInput {
  kind: DocumentKind;
  file: LocalDocumentFile;
  /** The application version the Partner is uploading against. */
  expectedVersion: number;
  onProgress?: (progress: UploadProgress) => void;
}

export class UploadFailure extends Error {
  readonly reason: UploadFailureReason;

  constructor(reason: UploadFailureReason, message: string) {
    super(message);
    this.name = "UploadFailure";
    this.reason = reason;
  }
}

/** PUTs the bytes to storage, reporting progress. Resolves on a 2xx only. */
async function putBytes(
  url: string,
  file: LocalDocumentFile,
  onProgress: (percent: number) => void,
): Promise<void> {
  try {
    await uploadToSignedUrl({
      uri: file.uri,
      contentType: file.mimeType,
      url,
      onProgress: (fraction) => onProgress(Math.round(fraction * 100)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /status (\d+)/.exec(message)?.[1];
    const expired = status === "403" || status === "401";
    throw new UploadFailure(
      expired ? "expired" : "network",
      expired
        ? `Storage refused the upload (${status}).`
        : message || "The upload could not reach storage.",
    );
  }
}

function finalizeFailure(error: unknown): UploadFailure {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) {
      return new UploadFailure(
        "conflict",
        "Your application changed while this was uploading.",
      );
    }
    // Django verified the stored object and did not accept it: wrong checksum,
    // wrong size, wrong type. Resending the same bytes cannot fix that.
    return new UploadFailure("rejected", "We could not accept that file.");
  }
  return new UploadFailure("unknown", "The upload did not complete.");
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadInput) => {
      const report = (progress: UploadProgress) => input.onProgress?.(progress);

      report({ phase: "hashing", percent: 0 });
      const sha256 = await sha256OfFile(input.file.uri);

      report({ phase: "requesting", percent: 0 });
      const upload = await request(() =>
        getApiClient().POST("/api/v1/partner/application/documents/uploads/", {
          body: {
            expected_version: input.expectedVersion,
            kind: input.kind,
            content_type: input.file.mimeType as Schemas["ContentTypeEnum"],
            size_bytes: input.file.size,
            sha256,
          },
        }),
      ).catch((error: unknown) => {
        throw finalizeFailure(error);
      });

      // A deadline that has already passed means the clock or the round trip is
      // badly off; sending bytes at it would waste the whole transfer.
      if (isUploadExpired(upload.expires_at)) {
        throw new UploadFailure("expired", "That upload link expired before it was used.");
      }

      report({ phase: "uploading", percent: 0 });
      await putBytes(upload.upload_url, input.file, (percent) =>
        report({ phase: "uploading", percent }),
      );

      report({ phase: "finalizing", percent: 100 });
      const document = await request(() =>
        getApiClient().POST("/api/v1/partner/application/documents/", {
          body: { expected_version: input.expectedVersion, upload_id: upload.id },
        }),
      ).catch((error: unknown) => {
        throw finalizeFailure(error);
      });

      report({ phase: "done", percent: 100 });
      return document;
    },

    // The application carries the document list and the version the next upload
    // needs, so it is refetched whether this succeeded or failed — a failed
    // finalize may still have moved the version.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
    },

    retry: false,
  });
}
