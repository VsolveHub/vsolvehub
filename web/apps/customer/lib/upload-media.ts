// Client-side helper for booking media/document uploads. Centralises validation
// + the POST to /api/bookings/media so every flow reports the same clear errors
// instead of silently dropping a failed upload.

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_LABEL = "5 MB";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type MediaUploadResult = { ok: true; urls: string[] } | { ok: false; error: string };

/**
 * Validates the chosen files, uploads them, and returns their URLs — or a
 * single human-readable error. Never throws.
 */
export async function uploadBookingMedia(
  files: FileList | File[] | null,
): Promise<MediaUploadResult> {
  const list = files ? Array.from(files) : [];
  if (list.length === 0) return { ok: true, urls: [] };

  // Validate up front for instant feedback (and to stay under request-body limits).
  for (const file of list) {
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return { ok: false, error: `"${file.name}" isn't a supported image. Use JPG, PNG, WebP, or GIF.` };
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return {
        ok: false,
        error: `"${file.name}" is ${humanFileSize(file.size)}. Please choose an image under ${MAX_MEDIA_LABEL}.`,
      };
    }
  }

  const formData = new FormData();
  list.forEach((file) => formData.append("files", file));

  try {
    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof data.error === "string" ? data.error : "Upload failed. Please try again." };
    }
    return { ok: true, urls: Array.isArray(data.urls) ? data.urls : [] };
  } catch {
    return { ok: false, error: "Upload failed — check your connection and try again." };
  }
}
