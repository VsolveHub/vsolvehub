"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { AttachmentRowView } from "../adapters";
import { languageLabel } from "../model/language";

/**
 * The uploader's list — one row per file, with the affordances that row has
 * actually earned.
 *
 * ## Why this is not `AttachmentList` from `packages/ui`
 *
 * One difference, and it is the whole reason: **`onRetry` on the shared
 * component is a list-level prop**, so it renders "Try again" on every failed
 * row. That is exactly the shape this screen cannot use. A file rejected by the
 * malware scan must never be offered a retry — the recovery is removal, and
 * "try again" on malware is an invitation to re-upload it — while a file whose
 * checksum did not match must be, because a retry is the whole recovery. One
 * button decided for the list cannot be right for both.
 *
 * Promotion of a per-item `retryable` flag to `packages/ui` is logged in the
 * execution plan §7. Until it lands, this list serves the uploader and the
 * shared one keeps every read-only caller.
 *
 * ## The four statuses, and the one that is easy to get wrong
 *
 * `checking` is a real state and not a variant of `attached`. A file that has
 * uploaded but not cleared its scan **is not attached**: `snapshot_requirement`
 * will not show it to a vendor, and a Customer who reads it as attached submits
 * believing a photograph went with the request. It gets its own line saying so.
 *
 * ## Previews
 *
 * Rendered from a `blob:` URL the browser already holds, which is why they exist
 * only for a file this device sent. There is no signed read-back URL in contract
 * 1.22.0, so an attachment read from the server has nothing to preview and shows
 * its kind instead of a thumbnail — an honest absence rather than a broken
 * image. Logged as a contract gap.
 */

export interface AttachmentRowsProps {
  items: readonly AttachmentRowView[];
  label: string;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  /** `blob:` URL for a row, when this device still holds the bytes. */
  previewUrlFor?: (id: string) => string | null;
  /** Disables the controls while a removal is in flight. */
  isBusy?: boolean;
  empty?: ReactNode;
}

const KIND_NOUN: Record<AttachmentRowView["kind"], string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice note",
  document: "Document",
};

function Preview({ item, url }: { item: AttachmentRowView; url: string | null }) {
  if (url === null) return null;

  if (item.kind === "image") {
    return (
      // A local `blob:` URL of the Customer's own file. `next/image` cannot
      // optimise one and would only add a proxy hop for bytes already in memory.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-14 w-14 shrink-0 rounded-control object-cover"
      />
    );
  }

  if (item.kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        aria-label={`Preview of ${item.name}`}
        className="h-20 w-32 shrink-0 rounded-control bg-surface-hover object-cover"
      />
    );
  }

  return (
    <audio src={url} controls preload="metadata" aria-label={`Play ${item.name}`} className="w-56" />
  );
}

function StatusLine({ item }: { item: AttachmentRowView }) {
  if (item.status === "failed") {
    return (
      <p className="text-xs text-danger-text">
        {item.error ?? "This file was not attached."}
      </p>
    );
  }

  if (item.status === "uploading") {
    if (item.progress === null) {
      // Hashing an 80 MB video takes visible seconds and is not measurable. A
      // progress bar frozen at 0% reads as a stalled upload and gets tapped
      // again; a word does not.
      return <p className="text-xs text-text-secondary">Preparing…</p>;
    }
    const percent = Math.min(100, Math.max(0, Math.round(item.progress)));
    return (
      <div className="flex items-center gap-2">
        <progress
          value={percent}
          max={100}
          aria-label={`Uploading ${item.name}`}
          className="h-1 w-24 overflow-hidden rounded-full"
        />
        <span className="text-xs text-text-secondary">{percent}%</span>
      </div>
    );
  }

  if (item.status === "checking") {
    return (
      <p className="text-xs text-text-secondary">
        Uploaded. We check every file before a professional can see it — you do
        not have to wait for this.
      </p>
    );
  }

  return (
    <p className="text-xs text-text-secondary">
      {KIND_NOUN[item.kind]}
      {item.size ? ` · ${item.size}` : ""}
      {item.language !== null ? ` · ${languageLabel(item.language)}` : ""}
    </p>
  );
}

export function AttachmentRows({
  items,
  label,
  onRemove,
  onRetry,
  previewUrlFor,
  isBusy = false,
  empty,
}: AttachmentRowsProps) {
  if (items.length === 0) return empty ? <>{empty}</> : null;

  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex items-center gap-3 rounded-control border px-3 py-2.5",
            item.status === "failed"
              ? "border-danger-line bg-danger-surface"
              : "border-line bg-surface",
          )}
        >
          <Preview item={item} url={previewUrlFor?.(item.id) ?? null} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{item.name}</p>
            <div className="mt-0.5">
              <StatusLine item={item} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Rendered from the row's own `canRetry`, never from `status ===
                "failed"`. That is the difference between offering a retry on a
                checksum mismatch and offering one on malware. */}
            {item.canRetry && onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                disabled={isBusy}
                className="inline-flex min-h-11 items-center rounded-control px-2.5 text-xs font-semibold text-text-link hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
              >
                Try again
                <span className="sr-only"> uploading {item.name}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center rounded-control px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
            >
              Remove
              <span className="sr-only"> {item.name}</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
