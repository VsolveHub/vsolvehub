"use client";

import { Badge, useT } from "@vsolve/ui";
import {
  evidenceFiles,
  evidenceNotes,
  isEvidenceReadable,
  isEvidenceRejectedByScan,
  type EngagementStage,
  type StageEvidence,
} from "@vsolve/query";
import { FileText, Film, Image as ImageIcon, MessageSquare } from "lucide-react";

import { timeAgo } from "@/lib/format";

/**
 * Everything attached to this stage, in the order it was attached.
 *
 * The history half of `M2-FE-603`. Append-only, because the record is: a
 * correction cycle leaves both accounts readable — what the vendor said the first
 * time, and what they said after the customer pushed back — and neither is edited
 * or removed.
 *
 * ## No thumbnails, and that is not an omission
 *
 * **`object_key` is never published.** A storage path turns every evidence read
 * into an enumeration surface, so the server does not publish one and there is no
 * download endpoint for stage evidence yet. A row therefore renders its kind, its
 * size, when it landed and whether the scan has cleared it — and nothing that
 * would need a URL. Faking a preview from a blob held in this tab would show the
 * vendor their own upload rather than the stored object, which is the one thing a
 * verification screen must not do. Logged in `frontend-execution-plan.md` §7.
 *
 * ## The scan status is a real state, not a spinner
 *
 * `processing_status` lands `PENDING` on finalization, because "matches the
 * checksum" and "is safe" are different questions. `PENDING` means attached and
 * not yet cleared for the customer to open. Saying so beats a progress indicator
 * that never resolves.
 */

const ICONS = {
  NOTE: MessageSquare,
  PHOTO: ImageIcon,
  VIDEO: Film,
  DOCUMENT: FileText,
} as const;

export interface EvidenceHistoryProps {
  readonly stage: EngagementStage;
}

export function EvidenceHistory({ stage }: EvidenceHistoryProps) {
  const t = useT();
  const notes = evidenceNotes(stage);
  const files = evidenceFiles(stage);

  if (stage.evidence.length === 0) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        {t("work.evidenceHistory.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {notes.map((note, index) => (
            <li key={note.id} className="flex flex-col gap-1 rounded-control bg-surface-sunken p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {index === 0
                  ? t("work.evidenceHistory.firstNote")
                  : t("work.evidenceHistory.resubmission", { index })}{" "}
                ·{" "}
                {timeAgo(note.created_at, t)}
              </span>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text">{note.note}</p>
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 ? null : (
        <ul className="flex flex-col divide-y divide-line">
          {files.map((file) => (
            <EvidenceRow key={file.id} evidence={file} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceRow({ evidence }: { readonly evidence: StageEvidence }) {
  const t = useT();
  const Icon = ICONS[evidence.kind] ?? FileText;

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} aria-hidden className="shrink-0 text-text-muted" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-text">
            {evidence.content_type || evidence.kind}
          </span>
          <span className="text-xs text-text-muted">
            {t("work.evidenceHistory.sizeMb", { size: (evidence.size_bytes / (1024 * 1024)).toFixed(1) })} ·{" "}
            {timeAgo(evidence.created_at, t)}
          </span>
        </span>
      </span>
      <ScanBadge evidence={evidence} />
    </li>
  );
}

function ScanBadge({ evidence }: { readonly evidence: StageEvidence }) {
  const t = useT();
  if (isEvidenceReadable(evidence)) {
    return <Badge tone="success">{t("work.evidenceHistory.scan.checked")}</Badge>;
  }
  if (isEvidenceRejectedByScan(evidence)) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Badge tone="danger">{t("work.evidenceHistory.scan.rejected")}</Badge>
        {evidence.failure_reason.trim() === "" ? null : (
          <span className="text-xs text-text-muted">{evidence.failure_reason}</span>
        )}
      </span>
    );
  }
  // Anything unrecognised falls here with `PENDING`, which is the fail-closed
  // direction: not yet readable by the customer.
  return <Badge tone="info">{t("work.evidenceHistory.scan.pending")}</Badge>;
}
