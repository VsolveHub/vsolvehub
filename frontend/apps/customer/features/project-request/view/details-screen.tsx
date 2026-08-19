"use client";

import { Textarea } from "@vsolve/ui";
import type { ReactNode } from "react";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { AttachmentRowView } from "@/features/requirement/adapters";
import { PhotoGrid } from "./parts/photo-grid";

/**
 * A5 · 3 — Show us the space.
 *
 * Everything here is optional, and the screen says so **once**, under the
 * heading, and never again. The previous version repeated it against every field
 * — "optional", "if you have one", "you can skip this" — which reads as the form
 * apologising for existing and makes the one genuinely useful sentence
 * ("photos get sharper estimates") disappear into the hedging.
 *
 * It is skippable from the header and from an empty Continue. Both go to the
 * same place; having only one would make the other look like a trap.
 */

export interface DetailsScreenProps {
  rows: readonly AttachmentRowView[];
  previewUrlFor: (id: string) => string | null;
  onAttach: (files: FileList) => void;
  onRemove: (attachmentId: string) => void;
  /**
   * The recorder, mounted by the caller.
   *
   * A slot rather than a callback, because recording is a stateful control with
   * permission handling, a language choice and four failure states of its own —
   * and one already exists. Passing it in keeps this screen free of the
   * MediaRecorder API and keeps there being exactly one recorder in the app.
   */
  voiceRecorder?: ReactNode;
  /** False before the draft exists — an attachment hangs off a requirement. */
  canAttach: boolean;
  /** How many more the server will take. */
  remaining: number;

  additionalDetails: string;
  onAdditionalDetails: (value: string) => void;
}

export function DetailsScreen({
  rows,
  previewUrlFor,
  onAttach,
  onRemove,
  voiceRecorder,
  canAttach,
  remaining,
  additionalDetails,
  onAdditionalDetails,
}: DetailsScreenProps) {
  const photos = rows.filter((row) => row.kind === "image");
  const voiceNotes = rows.filter((row) => row.kind === "audio");

  return (
    <>
      <div>
        <ScreenHeading title="Show us the space" />
        <p className="mt-1.5 text-[13.5px] leading-5 text-text-secondary">
          All optional — but photos get sharper estimates.
        </p>
      </div>

      <PhotoGrid
        rows={photos}
        previewUrlFor={previewUrlFor}
        onAttach={onAttach}
        onRemove={onRemove}
        canAttach={canAttach}
        remaining={remaining}
      />

      {/* A peer of the questions above it, not a footnote under the text box.
          Describing a fit-out is faster spoken than typed for almost everybody,
          and in a market where the customer's first language is often not the
          one this form is written in, speaking is the better input rather than
          the accessible fallback. */}
      <div className="rounded-[14px] border border-line bg-surface p-3.5">
        <FieldLabel>
          {voiceNotes.length === 0
            ? "Record a voice note"
            : `Voice notes (${voiceNotes.length} attached)`}
        </FieldLabel>
        {voiceRecorder}
      </div>

      {/* The card *is* the field. A bordered textarea inside a bordered card is
          two boxes for one input, which on a 390px screen is most of the
          remaining width spent on chrome. */}
      <div className="rounded-[14px] border border-line bg-surface p-3.5">
        <FieldLabel>Anything else</FieldLabel>
        <Textarea
          rows={3}
          value={additionalDetails}
          onChange={(event) => onAdditionalDetails(event.target.value)}
          placeholder="Lift till 7pm, no drilling before 9am…"
          aria-label="Anything else"
          className="border-0 bg-transparent p-0 focus-visible:outline-none"
        />
      </div>
    </>
  );
}
