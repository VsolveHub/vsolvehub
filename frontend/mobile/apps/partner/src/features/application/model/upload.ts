// Ported from frontend/apps/partner/features/application/model/upload.ts
/**
 * Preparing a KYC document for a server-owned signed upload.
 *
 * ## The shape of the flow
 *
 * Contract 1.5.0 splits upload into three steps, and the split is the security
 * property:
 *
 *   1. ask Django for an upload — it issues the object key, a signed URL and a
 *      deadline, after checking the Partner may upload this kind at all;
 *   2. PUT the bytes straight to private storage;
 *   3. finalize with `{expected_version, upload_id}` — Django verifies the
 *      stored object's size, type and checksum before accepting it.
 *
 * The client never chooses the object key and never asserts the file is valid.
 * It supplies a checksum Django re-computes, so a lie is caught at step three
 * rather than becoming a record.
 *
 * ## What must never be kept
 *
 * The signed URL, the upload token and the file bytes are all short-lived and
 * sensitive. None of them may be written to browser storage, logged, or put in a
 * query cache that outlives the attempt. Nothing here does; the functions are
 * pure and the URL lives in component state for the length of one upload.
 */

/** Types Django accepts. Anything else is refused before a byte is sent. */
export const ACCEPTED_CONTENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AcceptedContentType = (typeof ACCEPTED_CONTENT_TYPES)[number];

/** Django's own ceiling. Checking it here saves a doomed 20 MB upload. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type FileRejection =
  | { code: "empty"; message: string }
  | { code: "too_large"; message: string }
  | { code: "unsupported_type"; message: string };

/**
 * Whether this file can be uploaded at all.
 *
 * Client-side validation here is a courtesy, not a gate: Django re-checks size
 * and content type against the stored object, so a bypass changes nothing. It
 * exists so someone on a phone connection is told immediately instead of after
 * a two-minute upload.
 */
export function rejectFile(file: { size: number; type: string }): FileRejection | null {
  if (file.size === 0) {
    return { code: "empty", message: "That file is empty. Choose the photo or PDF again." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      code: "too_large",
      message: `That file is ${formatBytes(file.size)}. The largest we can accept is ${formatBytes(
        MAX_UPLOAD_BYTES,
      )} — try a photo instead of a scan.`,
    };
  }

  if (!ACCEPTED_CONTENT_TYPES.includes(file.type as AcceptedContentType)) {
    return {
      code: "unsupported_type",
      message: "We can accept a JPEG, a PNG or a PDF. Other formats are not readable by a reviewer.",
    };
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Hex SHA-256 of the file, computed in the browser.
 *
 * Django recomputes it over the stored bytes and refuses the finalize if they
 * disagree, which is what makes a truncated or swapped upload a failure rather
 * than a corrupt record nobody notices until a reviewer opens it.
 *
 * `crypto.subtle` requires a secure context; over plain HTTP on a non-localhost
 * origin it is absent, so the caller gets a clear error instead of a hang.
 */
export async function sha256Hex(file: Blob): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure hashing is unavailable in this browser context.");
  }

  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** True once the signed upload URL has expired and a new one must be requested. */
export function isUploadExpired(expiresAt: string, now: number = Date.now()): boolean {
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) ? deadline <= now : true;
}

export type UploadPhase =
  | "idle"
  | "hashing"
  | "requesting"
  | "uploading"
  | "finalizing"
  | "done"
  | "failed";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0-100 for the byte transfer only; the other phases are not measurable. */
  percent: number;
}

/**
 * Whether a failed attempt is worth retrying with the same file.
 *
 * An expired URL is: request a new one and send the same bytes. A rejected
 * checksum or type is not — the file itself is the problem, and retrying it
 * would fail identically while looking like a network flake.
 */
export function isRetryableUploadFailure(reason: UploadFailureReason): boolean {
  return reason === "expired" || reason === "network";
}

export type UploadFailureReason =
  | "expired"
  | "network"
  | "rejected"
  | "conflict"
  | "unknown";
