"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query";
import { useT } from "@vsolve/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import {
  isUploadExpired,
  sha256Hex,
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

export interface UploadInput {
  kind: DocumentKind;
  file: File;
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
function putBytes(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
  t: ReturnType<typeof useT>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Storage answers 403 for a signature that has expired. Treated as
      // retryable so the caller can request a fresh URL and resend the bytes.
      reject(
        new UploadFailure(
          xhr.status === 403 || xhr.status === 401 ? "expired" : "network",
          t("apply.upload.error.storageRefused", { status: xhr.status }),
        ),
      );
    };

    xhr.onerror = () =>
      reject(new UploadFailure("network", t("apply.upload.error.unreachable")));
    xhr.onabort = () => reject(new UploadFailure("network", t("apply.upload.error.cancelled")));

    xhr.send(file);
  });
}

function finalizeFailure(error: unknown, t: ReturnType<typeof useT>): UploadFailure {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) {
      return new UploadFailure("conflict", t("apply.upload.error.conflict"));
    }
    // Django verified the stored object and did not accept it: wrong checksum,
    // wrong size, wrong type. Resending the same bytes cannot fix that.
    return new UploadFailure("rejected", t("apply.upload.error.rejected"));
  }
  return new UploadFailure("unknown", t("apply.upload.error.unknown"));
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: async (input: UploadInput) => {
      const report = (progress: UploadProgress) => input.onProgress?.(progress);

      report({ phase: "hashing", percent: 0 });
      const sha256 = await sha256Hex(input.file);

      report({ phase: "requesting", percent: 0 });
      const upload = await request(() =>
        getApiClient().POST("/api/v1/partner/application/documents/uploads/", {
          body: {
            expected_version: input.expectedVersion,
            kind: input.kind,
            content_type: input.file.type as Schemas["ContentTypeEnum"],
            size_bytes: input.file.size,
            sha256,
          },
        }),
      ).catch((error: unknown) => {
        throw finalizeFailure(error, t);
      });

      // A deadline that has already passed means the clock or the round trip is
      // badly off; sending bytes at it would waste the whole transfer.
      if (isUploadExpired(upload.expires_at)) {
        throw new UploadFailure("expired", t("apply.upload.error.expired"));
      }

      report({ phase: "uploading", percent: 0 });
      await putBytes(upload.upload_url, input.file, input.file.type, (percent) =>
        report({ phase: "uploading", percent }),
        t,
      );

      report({ phase: "finalizing", percent: 100 });
      const document = await request(() =>
        getApiClient().POST("/api/v1/partner/application/documents/", {
          body: { expected_version: input.expectedVersion, upload_id: upload.id },
        }),
      ).catch((error: unknown) => {
        throw finalizeFailure(error, t);
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

export function usePartnerDocumentAccess() {
  return useMutation({
    mutationFn: async (documentId: string) =>
      request(() =>
        getApiClient().GET(
          "/api/v1/partner/application/documents/{document_id}/access/",
          {
            params: { path: { document_id: documentId } },
          },
        ),
      ),
  });
}

