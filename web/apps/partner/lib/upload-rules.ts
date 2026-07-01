// Shared upload rules for KYC files. Deliberately framework-agnostic (no
// "server-only") so both the client inputs (instant feedback) and the server
// actions (authoritative check) validate against the exact same limits.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "5 MB";

/** Comma-separated `accept` strings used by the file inputs, reused for validation. */
export const IMAGE_ACCEPT = "image/png,image/jpeg";
export const DOC_ACCEPT = "image/png,image/jpeg,application/pdf";

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function acceptLabel(accept: string): string {
  return accept.includes("application/pdf") ? "JPG, PNG, or PDF" : "JPG or PNG";
}

/**
 * Returns a human-readable error for an invalid file, or null when it's fine.
 * `label` names the file in the message ("profile photo", "trade certificate", …).
 */
export function validateUploadFile(
  file: File,
  opts: { label?: string; accept?: string } = {},
): string | null {
  const label = opts.label ?? "file";
  const accept = opts.accept ?? DOC_ACCEPT;

  if (file.size === 0) {
    return `Your ${label} looks empty or corrupted. Please choose the file again.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Your ${label} is ${humanFileSize(file.size)}. Please upload a file under ${MAX_UPLOAD_LABEL}.`;
  }
  // Some browsers report an empty type for valid files (e.g. HEIC) — only reject
  // when the type is known and not in the allow-list.
  const allowed = accept.split(",").map((t) => t.trim());
  if (file.type && !allowed.includes(file.type)) {
    return `Your ${label} must be a ${acceptLabel(accept)} file.`;
  }
  return null;
}
