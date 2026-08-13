"use client";

import { EmptyState } from "@vsolve/ui";
import type { StageEvidenceKind } from "@vsolve/query";

// The Customer app already renders file sizes on the requirement uploader, and
// two roundings of one byte count is how "1 MB" and "1.0 MB" end up on two
// screens describing the same file.
import { formatBytes } from "@/features/requirement/model/upload";
import type { EvidenceView } from "../adapters";

/**
 * What the vendor showed — the evidence viewer half of `M2-FE-609`.
 *
 * ## Why nothing here opens a file
 *
 * `object_key` is deliberately **not published** — a storage path turns every
 * evidence read into an enumeration surface — and 1.25.0 publishes no download
 * endpoint for stage evidence either. `RequirementAttachment` has one and
 * `StageEvidence` does not, so this renders what the record says about each
 * piece and states plainly that the file itself cannot be opened here yet.
 *
 * That is a worse screen than the one this task describes, and it is the honest
 * version of it. The alternatives were both worse: a thumbnail built from
 * nothing, or a "View" control that opens a 404 — and the second is the more
 * damaging, because a Customer who cannot see the evidence is being asked to
 * approve money against it. The panel therefore says so, rather than letting
 * them conclude the vendor submitted nothing. Logged in §7.
 *
 * ## The scan status is a gate, not a decoration
 *
 * `processing_status` is the scan pipeline's answer. `VERIFIED` is the only
 * value that means the file is safe; `PENDING` means the checksum matched and
 * the safety question has not been answered yet — two different questions,
 * deliberately separated on the server. Anything else fails closed.
 */

const EVIDENCE_KIND_LABEL: Record<StageEvidenceKind, string> = {
  NOTE: "Note",
  PHOTO: "Photo",
  VIDEO: "Video",
  DOCUMENT: "Document",
};

export interface StageEvidenceListProps {
  evidence: readonly EvidenceView[];
  /** "day" or "stage" — the noun this agreement uses. */
  stageNoun: string;
}

export function StageEvidenceList({ evidence, stageNoun }: StageEvidenceListProps) {
  if (evidence.length === 0) {
    return (
      <EmptyState
        title="Nothing has been submitted yet"
        compact
        description={`The professional shows their work for this ${stageNoun} here. Until they do, there is nothing for you to check.`}
      />
    );
  }

  return (
    <ol className="mt-3 flex list-none flex-col gap-2 p-0">
      {evidence.map((item) => (
        <li key={item.evidenceId} className="rounded-card border border-line bg-surface p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">{EVIDENCE_KIND_LABEL[item.kind]}</p>
            {item.submittedAt !== null ? (
              <p className="text-xs text-text-muted">{item.submittedAt}</p>
            ) : null}
          </div>

          {item.note !== null ? (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">{item.note}</p>
          ) : null}

          {item.sizeBytes !== null ? (
            <p className="mt-1 text-xs text-text-secondary">
              {formatBytes(item.sizeBytes)}
              {item.contentType !== null ? ` · ${item.contentType}` : ""}
            </p>
          ) : null}

          {/* A file row says what the record knows about the file and, when it
              is not readable, why. A `NOTE` carries no bytes and needs neither. */}
          {item.kind !== "NOTE" ? <FileState item={item} /> : null}
        </li>
      ))}
    </ol>
  );
}

function FileState({ item }: { item: EvidenceView }) {
  if (item.scanStatus === "PENDING") {
    return (
      <p className="mt-2 text-sm leading-6 text-text-secondary" role="status">
        We are still checking this file is safe. It is not ready to look at yet.
      </p>
    );
  }

  if (item.scanStatus === "INFECTED" || item.scanStatus === "FAILED") {
    return (
      <p className="mt-2 text-sm leading-6 text-danger-text">
        We could not accept this file
        {item.failureReason !== null ? `: ${item.failureReason}` : "."} Ask the
        professional to send it again.
      </p>
    );
  }

  if (!item.isReadable) {
    // Fail closed. An unrecognised scan status is not a green light.
    return (
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        We cannot tell whether this file is safe to open, so we are not offering
        it.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm leading-6 text-text-secondary">
      Checked and accepted. Opening files from this screen is not available yet —
      ask the professional to walk you through it, or contact support and we will
      send it to you.
    </p>
  );
}
