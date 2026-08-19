"use client";

import { Spinner, cn } from "@vsolve/ui";
import { useRef } from "react";

import type { AttachmentRowView } from "@/features/requirement/adapters";

/**
 * Photos of the space, as a grid rather than a list of file rows.
 *
 * ## Why a grid
 *
 * The desktop flow renders attachments as rows with a filename, a size and a
 * scan status. That is the right shape for a document and the wrong one for a
 * photograph: the customer took the picture, and what they need to check is that
 * they attached the *right room* — which a filename cannot tell them and a
 * thumbnail answers instantly.
 *
 * ## Failure states stay on the tile
 *
 * An upload in flight, and one the malware scan rejected, are both drawn on the
 * tile they belong to. A rejected file that vanished silently would leave the
 * customer believing they had attached something they had not — and the removal
 * affordance the server keeps open for exactly that case has to be reachable.
 */

export interface PhotoGridProps {
  rows: readonly AttachmentRowView[];
  /** Resolves a local preview for a file this tab uploaded. Null for the rest. */
  previewUrlFor: (id: string) => string | null;
  onAttach: (files: FileList) => void;
  onRemove: (attachmentId: string) => void;
  /** False before the draft exists — an attachment hangs off a requirement. */
  canAttach: boolean;
  /** How many more the server will take. */
  remaining: number;
}

export function PhotoGrid({
  rows,
  previewUrlFor,
  onAttach,
  onRemove,
  canAttach,
  remaining,
}: PhotoGridProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <ul className="grid list-none grid-cols-3 gap-[9px] p-0">
        {rows.map((row) => {
          const preview = previewUrlFor(row.id);
          return (
            <li key={row.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-sunken">
              {preview === null ? (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-semibold text-text-muted">
                  {row.name}
                </span>
              ) : (
                // A local object URL for a file this tab holds. `alt` names the
                // file rather than describing the picture, which is the only
                // honest thing available.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={row.name} className="h-full w-full object-cover" />
              )}

              {row.status === "uploading" || row.status === "checking" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-navy-900/40">
                  <Spinner />
                  <span className="sr-only">
                    {row.status === "uploading" ? "Uploading" : "Checking this file"}
                  </span>
                </span>
              ) : null}

              {row.status === "failed" ? (
                <span className="absolute inset-x-0 bottom-0 bg-danger-text px-1.5 py-0.5 text-[10px] font-semibold text-text-inverse">
                  {row.error ?? "Could not attach"}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => onRemove(row.id)}
                // 28px glyph in the corner; the whole tile is not the target
                // because tapping a photo to delete it is how photos get
                // deleted by accident.
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-900/70 text-sm text-text-inverse"
              >
                <span aria-hidden>×</span>
                <span className="sr-only">{`Remove ${row.name}`}</span>
              </button>
            </li>
          );
        })}

        {canAttach && remaining > 0 ? (
          <li className="aspect-square">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl",
                "border border-dashed border-warm-400 text-text-secondary",
                "transition-colors duration-fast hover:bg-surface-hover",
              )}
            >
              <span
                aria-hidden
                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-warm-400 text-lg leading-none"
              >
                +
              </span>
              <span className="text-[11px] font-semibold">Photo</span>
            </button>
          </li>
        ) : null}
      </ul>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files !== null && event.target.files.length > 0) {
            onAttach(event.target.files);
          }
          // Cleared so choosing the same file twice in a row still fires.
          event.target.value = "";
        }}
      />
    </div>
  );
}
