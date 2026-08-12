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
  onRemove: (attachmentId: string) => void;
  isRemoving: boolean;
  /** A removal that failed for a reason the Customer should see. Null otherwise. */
  removeError: unknown;
}

export function RequestAttachments({
  rows,
  isDraft,
  onRemove,
  isRemoving,
  removeError,
}: RequestAttachmentsProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="request-attachments-heading" className="mt-6">
      <h2 id="request-attachments-heading" className="text-lg font-semibold text-text">
        Files you attached
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Only the professionals we invited to quote can open these, and only once
        a file has passed our security check. Anyone who declines, runs out of
        time or is not chosen loses access; the professional you pick keeps it
        for the job.
      </p>

      {removeError !== null && removeError !== undefined ? (
        <div className="mt-3">
          <ErrorState
            title="We could not remove that file"
            message={describeError(removeError, "mutation").message}
            severity="error"
            inline
          />
        </div>
      ) : null}

      <ul aria-label="Files on this request" className="mt-3 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => {
          const rejected = row.status === "failed";
          const attachmentId = row.attachmentId;
          const removable = (isDraft || rejected) && attachmentId !== null;

          return (
            <li
              key={row.id}
              className={
                rejected
                  ? "flex items-center gap-3 rounded-control border border-danger-line bg-danger-surface px-3 py-2.5"
                  : "flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5"
              }
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{row.name}</p>
                <p
                  className={
                    rejected
                      ? "mt-0.5 text-xs text-danger-text"
                      : "mt-0.5 text-xs text-text-secondary"
                  }
                >
                  {rejected
                    ? (row.error ?? "This file was not attached.")
                    : row.status === "checking"
                      ? "Still being checked. No professional has seen it yet."
                      : `Passed our check · ${row.size}`}
                </p>
              </div>

              {removable ? (
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => onRemove(attachmentId)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
                >
                  Remove
                  <span className="sr-only"> {row.name}</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
