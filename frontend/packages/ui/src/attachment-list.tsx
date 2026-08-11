import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Files attached to a requirement, a proposal or a stage's evidence.
 *
 * One list for photos, a short video, documents and the voice note, because from
 * the reader's point of view they are the same thing: something someone
 * attached, which may still be uploading, may have failed, and may need
 * removing.
 *
 * ## Why upload state lives on the item
 *
 * A separate "uploading" tray beside a settled list is how a customer submits a
 * requirement believing four photos went with it when one was still in flight.
 * The file and its progress are one row, and `status` is the only thing that
 * decides whether it counts as attached.
 *
 * ## What this component does not do
 *
 * It does not upload, retry or delete — it renders state and reports intent. The
 * upload itself is a server-signed flow (`M2-BE-202`), and a component holding
 * its own upload state would be a second place that knows whether a file is
 * really there.
 */

export type AttachmentStatus = "uploading" | "attached" | "failed";

export type AttachmentKind = "image" | "video" | "audio" | "document";

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Photo",
  video: "Video",
  // "Voice note" rather than "Audio": it is the fast path the customer was
  // offered, and calling it back by a different name reads as a different thing.
  audio: "Voice note",
  document: "Document",
};

export interface Attachment {
  id: string;
  /** As the person named it. Never a server path — those leak bucket structure. */
  name: string;
  kind: AttachmentKind;
  status: AttachmentStatus;
  /** Already formatted, e.g. "2.4 MB". Omitted while the size is unknown. */
  size?: string;
  /** 0–100, only meaningful while `uploading`. */
  progress?: number;
  /** Why it failed, in words the person can act on. */
  error?: string;
}

export interface AttachmentListProps {
  items: readonly Attachment[];
  label: string;
  /** Omit to render read-only — the customer's view of a vendor's evidence. */
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  /** Shown when there is nothing attached yet. */
  empty?: ReactNode;
  className?: string;
}

function StatusLine({ item }: { item: Attachment }) {
  if (item.status === "failed") {
    return (
      <p className="text-xs text-danger-text">
        {item.error ?? "This file did not upload. It has not been attached."}
      </p>
    );
  }

  if (item.status === "uploading") {
    const percent = Math.min(100, Math.max(0, Math.round(item.progress ?? 0)));
    return (
      <div className="flex items-center gap-2">
        {/* A real progress element, so the value is announced and the platform
            owns the semantics. */}
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

  return (
    <p className="text-xs text-text-secondary">
      {KIND_LABEL[item.kind]}
      {item.size ? ` · ${item.size}` : ""}
    </p>
  );
}

export function AttachmentList({
  items,
  label,
  onRemove,
  onRetry,
  empty,
  className,
}: AttachmentListProps) {
  if (items.length === 0) return empty ? <>{empty}</> : null;

  return (
    <ul aria-label={label} className={cn("m-0 flex list-none flex-col gap-2 p-0", className)}>
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{item.name}</p>
            <div className="mt-0.5">
              <StatusLine item={item} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {item.status === "failed" && onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                className="inline-flex min-h-11 items-center rounded-control px-2.5 text-xs font-semibold text-text-link hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Try again
                <span className="sr-only"> uploading {item.name}</span>
              </button>
            ) : null}

            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="inline-flex min-h-11 items-center rounded-control px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Remove
                <span className="sr-only"> {item.name}</span>
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
