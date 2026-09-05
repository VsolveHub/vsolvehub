"use client";

import { isStageDisputed, isStageTransitionNotAllowed } from "@vsolve/query";
import { Button, ConfirmAction, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { ProjectView } from "@/features/project/adapters";
import type { EngagementView } from "../adapters";
import { useAcceptCompletion } from "../queries";
import type { ModeNouns } from "./engagement-status";

/**
 * The Customer agrees the job is finished — `M2-FE-511`, completed by
 * `M2-FE-611` at contract 1.31.0.
 *
 * `COMPLETING` is the server's own conclusion that every stage is released. This
 * is the separate fact that the **Customer** agrees it is done, and accepting it
 * closes the request as complete — the last transition in
 * `07-state-machines-and-permissions.md` §1.
 *
 * ## Three refusals, and this panel offers a shortcut past none of them
 *
 * `m2_engagement_completion_accept` refuses on an **open stage**, on a
 * **disputed stage** and on a **submitted handover the Customer has not
 * accepted** (`M2-BE-548`), and none of them approves anything on the way past.
 * That is deliberate on the server and it is deliberate here: an accepted
 * amendment can append work *after* `COMPLETING`, and that stage keeps its own
 * review. So the button is offered only when nothing is outstanding, and the
 * space is an **explanation** the rest of the time.
 *
 * Wave A3 offered the button on `COMPLETING` alone, which meant a project with a
 * newly appended stage showed a control that would answer `409`. The blockers
 * are now read from the engagement's own stages and from the project read, and
 * named — because "not every stage is settled yet" after the press is worse
 * information than "one stage is still open" before it.
 *
 * ## The status it lands on is read, never assumed
 *
 * An A5 project that withheld a warranty retention moves straight to
 * `WARRANTY`, not `COMPLETED`, and the two are different sentences: one is
 * finished, the other is finished with a promise still running and money still
 * held. The panel words them separately rather than treating both as "done", and
 * the warranty detail itself lives in `features/project/view/warranty-panel.tsx`
 * — from the server's numbers, never a date this client invented.
 */

export interface CompletionPanelProps {
  engagement: EngagementView;
  /**
   * The A5 project read, when there is one.
   *
   * Null on `LEAD_ONLY`, while the read is in flight, and when it failed. The
   * only thing this panel takes from it is the **handover blocker**, and a null
   * therefore has one safe reading: this panel does not know of a handover
   * blocking completion. It never invents one, and the server refuses the
   * command anyway if there is — which the refusal branch below then explains.
   */
  project: ProjectView | null;
  nouns: ModeNouns;
  onDone: () => void;
  /** Render the live question as a booking-hub card instead of a page section. */
  embedded?: boolean;
}

export function CompletionPanel({
  engagement,
  project,
  nouns,
  onDone,
  embedded = false,
}: CompletionPanelProps) {
  const accept = useAcceptCompletion();
  const [confirming, setConfirming] = useState(false);

  if (engagement.status === "WARRANTY") {
    return (
      <section className="mt-8 rounded-card border border-success-line bg-success-surface p-4">
        <h2 className="font-semibold text-text">You confirmed this is finished</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          {engagement.completedAt !== null ? `Confirmed ${engagement.completedAt}. ` : ""}
          The warranty period on this {nouns.engagement} is running — see below
          for what is still held and until when.
        </p>
      </section>
    );
  }

  if (engagement.status === "COMPLETED" || engagement.status === "CLOSED") {
    return (
      <section className="mt-8 rounded-card border border-success-line bg-success-surface p-4">
        <h2 className="font-semibold text-text">You confirmed this is finished</h2>
        {engagement.completedAt !== null ? (
          <p className="mt-1 text-sm text-text-secondary">Confirmed {engagement.completedAt}.</p>
        ) : null}
      </section>
    );
  }

  if (!engagement.canAcceptCompletion) {
    return null;
  }

  const handoverBlocks = project?.handover.blocksCompletion ?? false;
  const blocker = engagement.completionBlocker;

  return (
    <section
      aria-labelledby="completion-heading"
      className={
        embedded
          ? "rounded-card border border-warning-line bg-warning-surface p-4"
          : "mt-8"
      }
    >
      <h2 id="completion-heading" className="text-lg font-semibold text-text">
        Is this finished?
      </h2>

      {blocker === "disputed_stage" ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          A problem you raised on one {nouns.stage} is still open, so this{" "}
          {nouns.engagement} cannot be closed yet — and it will not be closed
          around it. We settle that first, and then this comes back to you.
        </p>
      ) : blocker === "open_stage" ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          There is still a {nouns.stage} outstanding on this {nouns.engagement}.
          That can happen after a change is agreed — the new work keeps its own
          check, and confirming here would not sweep it through. It comes back to
          you once that {nouns.stage} is settled.
        </p>
      ) : handoverBlocks ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          The professional has handed over what they made for you and you have
          not answered it yet. Accept it below first — this {nouns.engagement}{" "}
          deliberately cannot close while a delivery is unanswered.
        </p>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Every {nouns.stage} on this {nouns.engagement} has been approved and
            settled. Confirming closes the job and the request it came from. If
            something is still outstanding, do not confirm — raise a problem on
            the {nouns.stage} it is about instead, which stops that{" "}
            {nouns.stage}&apos;s money while we look.
          </p>

          <div className="mt-3">
            <Button
              className="w-full sm:w-auto"
              onClick={() => setConfirming(true)}
              disabled={accept.isPending}
            >
              Confirm it is finished
            </Button>
          </div>

          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title="Confirm this job is finished?"
            consequence={`This closes the ${nouns.engagement} and the request it came from. You can still read everything that happened, and this does not give up any legal right you have — but the platform stops asking either of you for anything further.${
              project === null || project.retention.phase === "none"
                ? ""
                : ` A warranty period starts from today, and ${project.retention.withheldLabel} of what the professional earned stays held by Vsolve until it ends.`
            }`}
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
        </>
      )}

      {isStageDisputed(accept.error) ? (
        <div className="mt-3">
          <ErrorState
            title="A problem is still open"
            message={`Somebody raised a problem on a ${nouns.stage} of this ${nouns.engagement}, so nothing can be closed while we look at it. We have re-read it — what you see now is what is actually there.`}
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </div>
      ) : isStageTransitionNotAllowed(accept.error) ? (
        <div className="mt-3">
          <ErrorState
            title="Something is still open"
            message={`Either a ${nouns.stage} is not settled yet, or a delivery is waiting for you to accept it, so this cannot be closed. We have re-read it — what you see now is what is actually there.`}
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
    </section>
  );
}
