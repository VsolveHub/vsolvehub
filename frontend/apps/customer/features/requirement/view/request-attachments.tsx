"use client";

import { describeError } from "@vsolve/query";
import { ErrorState } from "@vsolve/ui";

import type { AttachmentRowView } from "../adapters";

/**
 * The files on a request that has already been sent — and the one thing a
 * Customer can still do to them.
 *
 * ## Why removal exists here at all
 *
 * `remove_attachment` refuses once a requirement leaves `DRAFT`, because a
 * vendor was invited against a snapshot and taking away a photograph they quoted
 * on rewrites the question after the answer. It makes **one exception**, and the
 * exception is the reason this panel exists: an `INFECTED` attachment is
 * removable in *any* status, "so an infected file is never stuck on a live
 * requirement".
 *
 * A UI that offered removal only inside the four-screen draft flow would break
 * that promise the moment a scan verdict landed after submission — which is
 * exactly when it lands, since nothing blocks submission on a pending scan. So
 * the request page carries the affordance for precisely the case the server
 * allows and for no other.
 *
 * ## Never a retry
 *
 * A retry needs the bytes, and a page that only read the record does not have
 * them. `toServerAttachmentRows` sets `canRetry: false` on every row for that
 * reason, and for the deeper one: the only failed verdict a Customer is likely
 * to be looking at here is the malware one, where a retry must never be offered.
 *
 * ## No previews
 *
 * Contract 1.22.0 publishes no signed read-back URL for an attachment, so there
 * is nothing to render but the kind, the size and the state. That is an honest
 * absence rather than a broken image, and it is logged as a contract gap.
 */

export interface RequestAttachmentsProps {
  rows: readonly AttachmentRowView[];
  /**
   * Whether the requirement is still a draft.
   *
   * Decides which rows may be removed: everything while it is, and only a
   * rejected file once it is not — which is exactly what the server permits.
   */
  isDraft: boolean;
  /**
   * Omitted since contract 1.44.0 retired the requirement media-upload and
   * removal operations. Historical attachments stay readable — there is simply
   * no longer an endpoint to delete one, so the affordance is absent rather
   * than present and broken.
   */
  onRemove?: (attachmentId: string) => void;
  isRemoving?: boolean;
  /** A removal that failed for a reason the Customer should see. Null otherwise. */
  removeError?: unknown;
}

export function RequestAttachments({
  rows,
  isDraft,
  onRemove,
  isRemoving,
  removeError,
}: RequestAttachmentsProps) {
  if (rows.length === 0) return null;

  const photoCount = rows.filter((row) => row.kind === "image").length;
  const voiceCount = rows.filter((row) => row.kind === "audio").length;
  const otherCount = rows.length - photoCount - voiceCount;
  const summary = [
    photoCount === 0 ? null : `${photoCount} ${photoCount === 1 ? "photo" : "photos"}`,
    voiceCount === 0 ? null : `${voiceCount} ${voiceCount === 1 ? "voice note" : "voice notes"}`,
    otherCount === 0 ? null : `${otherCount} ${otherCount === 1 ? "file" : "files"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby="request-attachments-heading"
      className="rounded-[10px] border border-line bg-surface px-5 py-4 shadow-card"
    >
      {removeError !== null && removeError !== undefined ? (
        <div className="mb-3">
          <ErrorState
            title="We could not remove that file"
            message={describeError(removeError, "mutation").message}
            severity="error"
            inline
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10.5rem] sm:items-start">
        <div>
          <h2 id="request-attachments-heading" className="text-base font-bold tracking-tight text-text">
            What you sent
          </h2>
          <ul aria-label="Files on this request" className="mt-3 flex list-none flex-wrap gap-2.5 p-0">
        {rows.map((row) => {
          const rejected = row.status === "failed";
          const attachmentId = row.attachmentId;
          // `onRemove` is optional from 1.44.0: with the delete endpoint gone,
          // a caller that supplies no handler must render no button, rather than
          // one that fails on press.
          const removable =
            onRemove !== undefined && (isDraft || rejected) && attachmentId !== null;

          return (
            <li
              key={row.id}
              className={
                rejected
                  ? "group relative flex size-[78px] items-center justify-center rounded-[8px] border border-danger-line bg-danger-surface"
                  : row.kind === "audio"
                    ? "group relative flex size-[78px] items-center justify-center rounded-[8px] border border-signal-300 bg-signal-50"
                    : "group relative flex size-[78px] items-center justify-center rounded-[8px] border border-line bg-surface-sunken"
              }
            >
              <AttachmentGlyph kind={row.kind} rejected={rejected} />
              <span className="sr-only">
                {row.name}
                {rejected ? `, ${row.error ?? "not attached"}` : ""}
              </span>

              {removable ? (
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => onRemove?.(attachmentId)}
                  className="absolute right-1 top-1 inline-flex min-h-7 items-center rounded-control bg-surface px-2 text-[0.6875rem] font-semibold text-text-secondary shadow-card hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
                >
                  Remove
                  <span className="sr-only"> {row.name}</span>
                </button>
              ) : null}
            </li>
          );
        })}
          </ul>
        </div>
        {summary.length > 0 ? (
          <p className="text-sm font-semibold leading-snug text-text-secondary">{summary}</p>
        ) : null}
      </div>
    </section>
  );
}

function AttachmentGlyph({
  kind,
  rejected,
}: {
  kind: AttachmentRowView["kind"];
  rejected: boolean;
}) {
  if (kind === "audio") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        className={rejected ? "size-5 text-danger-text" : "size-5 text-text-secondary"}
      >
        <path d="M6 10v4" />
        <path d="M9 8v8" />
        <path d="M12 6v12" />
        <path d="M15 9v6" />
        <path d="M18 11v2" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={rejected ? "size-5 text-danger-text" : "size-5 text-warm-400"}
    >
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
      <path d="m7 15 3.2-3.2 2.5 2.5 1.4-1.4L17 15" />
      <circle cx="9" cy="10" r="1" />
    </svg>
  );
}
