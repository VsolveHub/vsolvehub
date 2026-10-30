"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, ErrorState, cn, useT, type Translator } from "@vsolve/ui";
import { useRef, useState } from "react";

import {
  ACCEPTED_CONTENT_TYPES,
  formatBytes,
  rejectFile,
} from "@/features/application/model/upload";

import type { CrewDocumentState, CrewRow } from "../adapters/roster";
import { useUploadCrewDocument, type CrewDocumentKind } from "../queries";

/**
 * Sending one worker's identity documents to Operations.
 *
 * Until this existed, `documents_verified_at` recorded that a reviewer had checked something with
 * nothing anywhere in the product to check — the reviewer was attesting to a conversation in a
 * chat app, or to nothing at all. This is the file behind the timestamp.
 *
 * ## Why the government ID is separated from the other two
 *
 * Only one kind gates verification, and a screen that listed three equal-looking slots would have
 * a Partner chasing a police-verification certificate to unblock a worker who is already
 * eligible. So the required one is stated as required, and the rest are offered as *"if you have
 * it"* — which is also the honest description of what Operations does with them today.
 *
 * ## Why a rejection is shown with its reason and not just as a red badge
 *
 * The reason is the only thing that tells the Partner whether to re-photograph the same card or
 * find a different document. A rejection without one is a loop.
 */
function optionalKinds(t: Translator["t"]): readonly { kind: CrewDocumentKind; label: string }[] {
  return [
    { kind: "ADDRESS_PROOF", label: t("crew.documents.addressProof") },
    { kind: "POLICE_VERIFICATION", label: t("crew.documents.policeVerification") },
  ];
}

function statusTone(t: Translator["t"]) {
  return {
    APPROVED: { tone: "success" as const, label: t("crew.documents.approved") },
    PENDING: { tone: "info" as const, label: t("crew.documents.withOperations") },
    REJECTED: { tone: "danger" as const, label: t("crew.documents.rejected") },
  };
}

export interface CrewDocumentUploaderProps {
  readonly row: CrewRow;
  readonly className?: string;
}

export function CrewDocumentUploader({ row, className }: CrewDocumentUploaderProps) {
  const t = useT();
  const upload = useUploadCrewDocument();
  const [activeKind, setActiveKind] = useState<CrewDocumentKind | null>(null);
  const [percent, setPercent] = useState(0);
  const [localProblem, setLocalProblem] = useState<string | null>(null);

  const stateFor = (kind: CrewDocumentKind): CrewDocumentState | undefined =>
    row.documents.find((document) => document.kind === kind);

  const send = (kind: CrewDocumentKind, file: File) => {
    // Checked here before a byte moves. The bucket refuses an oversized file and Django refuses
    // an unsupported type, but a Partner on a metered site connection should not upload eleven
    // megabytes to be told no at the end of it.
    const rejection = rejectFile(file, t);
    if (rejection !== null) {
      setLocalProblem(
        rejection.code === "too_large"
          ? t("crew.documents.tooLarge", { size: formatBytes(file.size) })
          : rejection.message,
      );
      return;
    }
    setLocalProblem(null);
    setActiveKind(kind);
    setPercent(0);
    upload.mutate(
      {
        membershipId: row.membershipId,
        kind,
        file,
        onProgress: (progress) => setPercent(progress.percent),
      },
      { onSettled: () => setActiveKind(null) },
    );
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <DocumentSlot
        label={t("crew.documents.governmentId")}
        hint={t("crew.documents.governmentIdHint")}
        required
        state={stateFor("GOVERNMENT_ID")}
        busy={activeKind === "GOVERNMENT_ID"}
        percent={percent}
        disabled={upload.isPending}
        onPick={(file) => send("GOVERNMENT_ID", file)}
      />

      {optionalKinds(t).map((option) => (
        <DocumentSlot
          key={option.kind}
          label={option.label}
          hint={t("crew.documents.ifYouHaveIt")}
          state={stateFor(option.kind)}
          busy={activeKind === option.kind}
          percent={percent}
          disabled={upload.isPending}
          onPick={(file) => send(option.kind, file)}
        />
      ))}

      {localProblem ? (
        <ErrorState inline severity="warning" title={t("crew.documents.cannotSendTitle")} message={localProblem} />
      ) : null}

      {upload.isError ? (
        <ErrorState
          inline
          severity="error"
          title={t("crew.documents.uploadFailedTitle")}
          message={describeError(upload.error, "mutation").message}
        />
      ) : null}
    </div>
  );
}

function DocumentSlot({
  label,
  hint,
  required = false,
  state,
  busy,
  percent,
  disabled,
  onPick,
}: {
  label: string;
  hint: string;
  required?: boolean;
  state: CrewDocumentState | undefined;
  busy: boolean;
  percent: number;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const badge = state ? statusTone(t)[state.status as keyof ReturnType<typeof statusTone>] : undefined;
  // Approved is the one state where re-sending is a mistake rather than a fix: it would supersede
  // a cleared document and put the worker back in the queue for no reason.
  const canReplace = state?.status !== "APPROVED";

  return (
    <div className="rounded-card border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {label}
            {required ? <span className="ml-1 text-xs text-text-muted">{t("crew.documents.required")}</span> : null}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">{hint}</p>
        </div>
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </div>

      {state?.status === "REJECTED" && state.reason ? (
        <p className="mt-2 rounded-control bg-danger-surface px-2.5 py-2 text-xs leading-5 text-danger-text">
          {state.reason}
        </p>
      ) : null}

      {busy ? (
        <p className="mt-2 text-xs text-text-secondary" aria-live="polite">
          {t("crew.documents.sending", { percent })}
        </p>
      ) : canReplace ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_CONTENT_TYPES.join(",")}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so picking the same file twice after a rejection still fires `change`.
              event.target.value = "";
              if (file) onPick(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {state ? t("crew.documents.replace") : t("crew.documents.chooseFile")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
