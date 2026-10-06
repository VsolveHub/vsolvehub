// Ported from frontend/apps/customer/features/requirement/model/upload.ts
/**
 * Preparing a requirement attachment for the server-signed upload — `M2-FE-204`.
 *
 * ## The three-step handshake, and why the client cannot shortcut it
 *
 * Contract 1.22.0 splits an attachment into three calls, and the split *is* the
 * security property:
 *
 *   1. `POST /requirements/{id}/attachments/uploads/` — the client declares the
 *      kind, media type, size and SHA-256 it is about to send; Django names the
 *      object key and answers with a signed URL and a deadline;
 *   2. `PUT` the bytes straight to private storage — they never pass through
 *      Django;
 *   3. `POST /requirements/{id}/attachments/` — Django streams the stored object
 *      back and refuses anything whose size, media type or checksum disagrees
 *      with step 1.
 *
 * The client never chooses the object key and never asserts a file is valid. It
 * supplies a checksum the server recomputes, so a lie is caught at step three
 * rather than becoming a record.
 *
 * ## Everything below is a courtesy, not a gate
 *
 * The allow-lists and ceilings here are a mirror of
 * `backend/apps/requirements/attachments.py` — `ACCEPTED_MEDIA_TYPES`,
 * `MAXIMUM_SIZE_BYTES`, `MAXIMUM_ATTACHMENTS_PER_REQUIREMENT` — and the server
 * is the authority for every one of them. They exist so somebody on a phone
 * connection is told *which file* and *why* before an 80 MB upload, rather than
 * after it. A bypass changes nothing: `_create_upload_intent` re-checks all
 * three before it will issue a URL.
 *
 * They are also the reason a refusal lands against the offending file. A
 * page-level "that did not work" for a picker that took four files is the error
 * message that makes somebody remove all four.
 */

/**
 * The kinds a Customer can produce on screen 3.
 *
 * `AUDIO` is absent deliberately — it is a kind the *server* can send back (an
 * Operations upload, a future audio-file picker) and is handled where server
 * records are read. What the picker offers is photos, video and PDFs; a voice
 * note comes from the recorder and is `VOICE_NOTE`, which is a different thing
 * with different copy even though both are audio bytes.
 */
export type PickedAttachmentKind = "IMAGE" | "VIDEO" | "DOCUMENT";

export type UploadableAttachmentKind = PickedAttachmentKind | "VOICE_NOTE";

/**
 * Media types accepted per kind, mirroring the server's allow-list.
 *
 * Keyed by kind rather than global for the reason the server states: a
 * "document" that is really an `image/svg+xml` is a script, and a "voice note"
 * that is really a PDF is a client bug worth refusing rather than storing.
 */
export const ACCEPTED_MEDIA_TYPES: Record<UploadableAttachmentKind, readonly string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  VIDEO: ["video/mp4", "video/quicktime", "video/webm"],
  DOCUMENT: ["application/pdf"],
  VOICE_NOTE: ["audio/mp4", "audio/webm", "audio/ogg"],
};

/**
 * Size ceilings per kind, in bytes. Different because the reasons differ, and
 * the server's own comment is the one worth repeating: a photograph is
 * compressible and a 25 MB one is an unresized camera dump, while a 60-second
 * site video genuinely is tens of megabytes and refusing it would push the
 * Customer to describe the leak in prose.
 */
export const MAXIMUM_SIZE_BYTES: Record<UploadableAttachmentKind, number> = {
  IMAGE: 12 * 1024 * 1024,
  VIDEO: 80 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
  VOICE_NOTE: 8 * 1024 * 1024,
};

/** How many attachments one requirement may carry. The server's number. */
export const MAXIMUM_ATTACHMENTS = 12;

/**
 * The ceiling for a kind, or null for one this client cannot produce.
 *
 * `AUDIO` is the null case: the server can send an attachment of that kind back
 * and the picker has no way to create one, so there is no ceiling to quote in a
 * refusal about it. Returning null rather than a number keeps the copy honest
 * instead of asserting a limit that was never checked.
 */
export function maximumSizeFor(kind: string): number | null {
  const ceilings: Record<string, number | undefined> = MAXIMUM_SIZE_BYTES;
  return ceilings[kind] ?? null;
}

/** What the file input advertises. Kinds the recorder owns are not in it. */
export const PICKER_ACCEPT = [
  ...ACCEPTED_MEDIA_TYPES.IMAGE,
  ...ACCEPTED_MEDIA_TYPES.VIDEO,
  ...ACCEPTED_MEDIA_TYPES.DOCUMENT,
].join(",");

/**
 * The media type without its parameters, lower-cased.
 *
 * `MediaRecorder` hands back `audio/webm;codecs=opus`, and Django normalises the
 * declared type the same way (`content_type.lower().partition(";")[0].strip()`)
 * before storing it on the intent. Sending the unnormalised string to the
 * presign **and** the raw one on the `PUT` is how the two end up disagreeing at
 * finalize, which surfaces as "that file did not match what your device sent"
 * for a file that matched perfectly.
 */
export function normalizeContentType(contentType: string): string {
  return contentType.toLowerCase().split(";")[0]?.trim() ?? "";
}

/**
 * Media type by file extension, for the phones that report none.
 *
 * Android and older iOS both hand back `File.type === ""` for HEIC and
 * occasionally for `.mov`. Refusing those as "unsupported" would be this client
 * blaming the Customer for their camera. The fallback is safe because the
 * declared type is also the one sent as the `PUT`'s `content-type`, so whatever
 * storage records is what Django was told to expect — the checksum still has to
 * agree, and it is the checksum that makes the handshake worth anything.
 */
const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

export function declaredContentType(file: { name: string; type: string }): string {
  const fromBrowser = normalizeContentType(file.type);
  if (fromBrowser !== "") return fromBrowser;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MEDIA_TYPES[extension] ?? "";
}

/** Which picker kind claims this media type, or null when none does. */
export function pickedKindFor(contentType: string): PickedAttachmentKind | null {
  const normalized = normalizeContentType(contentType);
  if (ACCEPTED_MEDIA_TYPES.IMAGE.includes(normalized)) return "IMAGE";
  if (ACCEPTED_MEDIA_TYPES.VIDEO.includes(normalized)) return "VIDEO";
  if (ACCEPTED_MEDIA_TYPES.DOCUMENT.includes(normalized)) return "DOCUMENT";
  return null;
}

/** Bytes as a short human string. Approximate on purpose — a hint, not an audit. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Why a file cannot be sent, as a code.
 *
 * The same vocabulary the reducer's `AttachmentFailure` uses for its
 * client-side half, so a refusal decided here and a refusal decided by the
 * server land in one row with one copy table behind them.
 */
export type FileRejectionCode = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "TOO_MANY";

export interface AcceptedFile {
  kind: UploadableAttachmentKind;
  /** Normalised, and the exact string sent to both the presign and the `PUT`. */
  contentType: string;
}

export type FileVerdict =
  | { accepted: true; file: AcceptedFile }
  | { accepted: false; code: FileRejectionCode };

/**
 * Whether this file can be sent at all, and as what.
 *
 * `attachmentCount` is checked here rather than at the call site because the
 * server refuses the thirteenth attachment with the same `m2_attachment_invalid`
 * it uses for an unsupported type, and a Customer who selected six photos needs
 * to know *which* were refused and why — not that "something" was.
 */
export function classifyPickedFile(
  file: { name: string; size: number; type: string },
  attachmentCount: number,
): FileVerdict {
  if (attachmentCount >= MAXIMUM_ATTACHMENTS) return { accepted: false, code: "TOO_MANY" };
  if (file.size === 0) return { accepted: false, code: "EMPTY" };

  const contentType = declaredContentType(file);
  const kind = pickedKindFor(contentType);
  if (kind === null) return { accepted: false, code: "UNSUPPORTED_TYPE" };
  if (file.size > MAXIMUM_SIZE_BYTES[kind]) return { accepted: false, code: "TOO_LARGE" };

  return { accepted: true, file: { kind, contentType } };
}

/** The recorder's half of the same check. The kind is known; the bytes are not. */
export function classifyRecording(
  blob: { size: number; type: string },
  attachmentCount: number,
): FileVerdict {
  if (attachmentCount >= MAXIMUM_ATTACHMENTS) return { accepted: false, code: "TOO_MANY" };
  if (blob.size === 0) return { accepted: false, code: "EMPTY" };

  const contentType = normalizeContentType(blob.type);
  if (!ACCEPTED_MEDIA_TYPES.VOICE_NOTE.includes(contentType)) {
    return { accepted: false, code: "UNSUPPORTED_TYPE" };
  }
  if (blob.size > MAXIMUM_SIZE_BYTES.VOICE_NOTE) return { accepted: false, code: "TOO_LARGE" };

  return { accepted: true, file: { kind: "VOICE_NOTE", contentType } };
}

/**
 * Hex SHA-256 of the bytes, computed in the browser.
 *
 * Django recomputes it over the stored object and refuses the finalize if the
 * two disagree, which is what turns a truncated or swapped upload into a visible
 * failure rather than a corrupt record nobody notices until a vendor opens it.
 *
 * `crypto.subtle` needs a secure context. Over plain HTTP on a non-localhost
 * origin it is simply absent, so the caller gets a clear failure instead of a
 * hang — and the screen says attachments are unavailable rather than blaming
 * the file.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure hashing is unavailable in this browser context.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * True once the signed upload URL has expired and a new one must be requested.
 *
 * An unparseable deadline reads as expired. The alternative — treating "we
 * cannot tell" as "still good" — spends the whole transfer to find out.
 */
export function isUploadExpired(expiresAt: string, now: number = Date.now()): boolean {
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) ? deadline <= now : true;
}

/**
 * Where one attachment has got to, for the progress line.
 *
 * `hashing` is separate from `uploading` because on a large video it is the
 * phase that visibly takes time while nothing appears to be happening, and a
 * progress bar stuck at 0% is how somebody decides the app is broken and taps
 * again.
 */
export type UploadPhase = "hashing" | "requesting" | "uploading" | "finalizing";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0–100 for the byte transfer only. The other phases are not measurable. */
  percent: number;
}
