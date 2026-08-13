"use client";

import { isStageTransitionNotAllowed } from "@vsolve/query";
import { Button, ConfirmAction, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { EngagementView } from "../adapters";
import { useAcceptCompletion } from "../queries";
import type { ModeNouns } from "./engagement-status";
import { NotBuiltYet } from "./not-built-yet";

/**
 * The Customer agrees the job is finished — the completion half of `M2-FE-511`.
 *
 * `COMPLETING` is the server's own conclusion that every stage is released. This
 * is the separate fact that the **Customer** agrees it is done, and accepting it
 * closes the request as complete — the last transition in
 * `07-state-machines-and-permissions.md` §1, which until 1.25.0 had nothing to
 * drive it.
 *
 * ## Why the button only exists in one state
 *
 * `POST /engagements/{id}/completion/` answers `409` while stages are still
 * open, so offering it earlier would be offering a refusal. The panel renders as
 * an explanation before that point and as a record after it.
 *
 * ## What is deliberately not here
 *
 * **`M2-FE-611`** — deliverable acceptance, the warranty window and the
 * retention release date. It needs C5, and `Engagement` publishes neither a
 * retention amount nor a warranty end. A date invented by this client is a
 * promise the platform has not made, and a Customer who reads a wrong warranty
 * date is a Customer who reports a fault a week too late. The block says so and
 * offers nothing.
 */

export interface CompletionPanelProps {
  engagement: EngagementView;
  nouns: ModeNouns;
  onDone: () => void;
}

export function CompletionPanel({ engagement, nouns, onDone }: CompletionPanelProps) {
  const accept = useAcceptCompletion();
  const [confirming, setConfirming] = useState(false);

  if (engagement.status === "COMPLETED" || engagement.status === "WARRANTY") {
    return (
      <section className="mt-8 rounded-card border border-success-line bg-success-surface p-4">
        <h2 className="font-semibold text-text">You confirmed this is finished</h2>
        {engagement.completedAt !== null ? (
          <p className="mt-1 text-sm text-text-secondary">Confirmed {engagement.completedAt}.</p>
        ) : null}
        <WarrantyGap />
      </section>
    );
  }

  if (!engagement.canAcceptCompletion) {
    return null;
  }

  return (
    <section aria-labelledby="completion-heading" className="mt-8">
      <h2 id="completion-heading" className="text-lg font-semibold text-text">
        Is this finished?
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Every {nouns.stage} on this {nouns.engagement} has been approved and
        settled. Confirming closes the job and the request it came from. If
        something is still outstanding, do not confirm — raise a problem on the{" "}
        {nouns.stage} it is about instead, which stops that {nouns.stage}&apos;s
        money while we look.
      </p>

      <div className="mt-3">
        <Button onClick={() => setConfirming(true)} disabled={accept.isPending}>
          Confirm it is finished
        </Button>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this job is finished?"
        consequence={`This closes the ${nouns.engagement} and the request it came from. You can still read everything that happened, and this does not give up any legal right you have — but the platform stops asking either of you for anything further.`}
        confirmLabel="Yes, it is finished"
        pending={accept.isPending}
        onConfirm={() =>
          accept.mutate(engagement.engagementId, {
            onSuccess: () => {
              setConfirming(false);
              onDone();
            },
          })
        }
      />

      {isStageTransitionNotAllowed(accept.error) ? (
        <div className="mt-3">
          <ErrorState
            title="Something is still open"
            message={`Not every ${nouns.stage} is settled yet, so this cannot be closed. We have re-read it — what you see now is what is actually there.`}
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </div>
      ) : (
        <div className="mt-3">
          <AccessRefusal error={accept.error} attempting="close this job" />
        </div>
      )}

      <WarrantyGap />
    </section>
  );
}

function WarrantyGap() {
  return (
    <NotBuiltYet
      className="mt-4"
      title="Warranty and money held back"
      body="Accepting each deliverable, reporting a fault inside the warranty window and seeing when the money held back is released are not built yet. Nothing here is a statement about what cover you have — the terms are the ones on the quote you accepted. If something goes wrong, contact support and we will take it from there."
      taskId="M2-FE-611"
    />
  );
}
