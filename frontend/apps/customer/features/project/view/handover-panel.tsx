"use client";

import { isStageDisputed, isStageTransitionNotAllowed } from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { DeliverableView, HandoverView } from "../adapters";
import { useAcceptHandover } from "../queries";

/**
 * What the professional handed over, and the Customer's explicit acceptance —
 * `M2-FE-611` / `M2-BE-547`.
 *
 * ## Why acceptance is a button and not a side effect
 *
 * A photographer delivers the gallery in week two of a four-week edit, so
 * "the deliverables are fine" and "the project is finished" are two different
 * facts on two different days. They have two commands on the server for exactly
 * that reason, and this panel is the first one.
 *
 * It is also the mechanism that keeps Event and Media delivery on the platform:
 * while a handover is submitted and unaccepted, `m2_engagement_completion_accept`
 * **refuses**. A vendor who hands over privately has an engagement that will not
 * close and a retention that will not release — so this panel says out loud that
 * the project cannot close until the Customer answers it, rather than leaving
 * them to discover it at the completion button.
 *
 * ## Accepting can also finish the project, and the confirmation says so
 *
 * When the project is already `COMPLETING`, accepting the handover completes it
 * in the same call. The Customer is not asked to press a second button to repeat
 * something they have just said — but they are told, before they press this one,
 * that it may be the last word.
 *
 * ## The uncomfortable part, stated rather than hidden
 *
 * **A `FILE` deliverable cannot be opened here.** It is a row on the stage
 * evidence rail, whose `object_key` is deliberately unpublished and for which no
 * download route exists (§7, open since `M2-FE-609`). That is worse on this
 * screen than on the evidence viewer, because here the Customer is being asked
 * to *accept* the thing they cannot open. The panel therefore reports what the
 * record knows — checked, still being scanned, rejected, or not found at all —
 * and never implies the file has been seen. A `LINK` is opened honestly as what
 * it is: a location Vsolve recorded and does not host.
 */

export interface HandoverPanelProps {
  engagementId: string;
  handover: HandoverView;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  onDone: () => void;
}

export function HandoverPanel({
  engagementId,
  handover,
  engagementNoun,
  onDone,
}: HandoverPanelProps) {
  const accept = useAcceptHandover();
  const [confirming, setConfirming] = useState(false);

  // Nothing has been handed over. Rendered as absence rather than as an empty
  // state: most projects are finished by standing somewhere rather than by
  // handing a file over, and "nothing has been delivered yet" on a bathroom
  // refit is an alarm about a thing that was never going to happen.
  if (handover.phase === "none") return null;

  return (
    <section aria-labelledby="handover-heading" className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="handover-heading" className="text-lg font-semibold text-text">
          What the professional handed over
        </h2>
        {handover.phase === "accepted" ? (
          <Badge tone="success">You accepted this</Badge>
        ) : (
          <Badge tone="warning">Waiting for you</Badge>
        )}
      </div>

      {handover.submittedAt !== null ? (
        <p className="mt-1 text-sm text-text-secondary">Delivered {handover.submittedAt}.</p>
      ) : null}

      {handover.note !== null ? (
        <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-6 text-text">
          {handover.note}
        </p>
      ) : null}

      {handover.deliverables.length === 0 ? (
        // A submitted handover with nothing on it should not exist — the server
        // refuses one — so this says what it sees rather than inventing a reason.
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          This {engagementNoun} is marked as handed over, but we cannot see what
          was delivered. Do not accept it until you have — contact support with
          this {engagementNoun} and we will find out what happened.
        </p>
      ) : (
        <ol className="mt-3 flex list-none flex-col gap-2 p-0">
          {handover.deliverables.map((deliverable) => (
            <DeliverableRow key={deliverable.deliverableId} deliverable={deliverable} />
          ))}
        </ol>
      )}

      {handover.phase === "accepted" ? (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          You accepted these{handover.acceptedAt === null ? "" : ` on ${handover.acceptedAt}`}. They
          stay on this {engagementNoun} for both of you.
        </p>
      ) : (
        <>
          <p className="mt-3 max-w-prose text-sm leading-6 text-text">
            Check what is here before you accept it. This {engagementNoun}{" "}
            <strong className="font-semibold">cannot be closed until you do</strong>, which is
            deliberate — it is what keeps the delivery on this platform rather than in a private
            message. If something is missing or wrong, do not accept it: raise a problem on the
            stage it belongs to, which stops that stage&apos;s money while we look.
          </p>

          {handover.deliverables.length > 0 ? (
            <div className="mt-3">
              <Button onClick={() => setConfirming(true)} disabled={accept.isPending}>
                Accept what was delivered
              </Button>
            </div>
          ) : null}

          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title="Accept these deliverables?"
            consequence={`This records that you accepted what is listed here, on this ${engagementNoun}, today. If this was the only thing outstanding it also closes the ${engagementNoun} — so do not accept it if anything is still to come.`}
            confirmLabel="Yes, I accept these"
            pending={accept.isPending}
            onConfirm={() =>
              accept.mutate(engagementId, {
                onSuccess: () => {
                  setConfirming(false);
                  onDone();
                },
              })
            }
          />
        </>
      )}

      <AcceptanceRefusal
        error={accept.error}
        engagementNoun={engagementNoun}
        onRefresh={onDone}
      />
    </section>
  );
}

/**
 * Why the acceptance was refused — and it is often not about the handover.
 *
 * The server runs the acceptance and, on a `COMPLETING` project, the completion
 * in **one transaction**, so an open or disputed milestone rolls the acceptance
 * back with it. Reporting that as "we could not save your acceptance" would send
 * the Customer looking at the wrong thing entirely.
 */
function AcceptanceRefusal({
  error,
  engagementNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  if (isStageDisputed(error)) {
    return (
      <div className="mt-3">
        <ErrorState
          title="A problem you raised is still open"
          message={`A stage on this ${engagementNoun} has a problem open on it, so nothing can be closed while we look at it. Your acceptance was not recorded — come back once that is settled.`}
          severity="warning"
          inline
        />
      </div>
    );
  }

  if (isStageTransitionNotAllowed(error)) {
    return (
      <div className="mt-3">
        <ErrorState
          title="Something on this project is still open"
          message={`Either there is nothing to accept, or a stage is still outstanding and this ${engagementNoun} cannot close around it. We have re-read it — what you see now is what is actually there.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onRefresh}
          inline
        />
      </div>
    );
  }

  return (
    <div className="mt-3">
      <AccessRefusal error={error} attempting="accept what was delivered" />
    </div>
  );
}

function DeliverableRow({ deliverable }: { deliverable: DeliverableView }) {
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-text">{deliverable.title}</p>
        {deliverable.submittedAt !== null ? (
          <p className="text-xs text-text-muted">{deliverable.submittedAt}</p>
        ) : null}
      </div>

      {deliverable.milestoneLabel !== null ? (
        <p className="mt-0.5 text-sm text-text-secondary">For {deliverable.milestoneLabel}</p>
      ) : null}

      {deliverable.kind === "LINK" ? (
        <LinkDeliverable deliverable={deliverable} />
      ) : deliverable.kind === "FILE" ? (
        <FileDeliverable deliverable={deliverable} />
      ) : (
        // Fail closed. A third kind reaching an older bundle is not rendered as
        // the nearest-looking one, because the two differ in whether Vsolve is
        // holding the thing at all.
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          This app does not recognise what kind of delivery this is, so it is not going to guess.
          Contact support before accepting it.
        </p>
      )}
    </li>
  );
}

/**
 * A recorded location, not a hosted file — said out loud, because clicking it
 * leaves this platform.
 *
 * What the row buys is that this Customer accepted that location at that moment
 * against this project. Vsolve does not hold the bytes and cannot get them back
 * if the vendor deletes them, and that is worth knowing **before** accepting.
 */
function LinkDeliverable({ deliverable }: { deliverable: DeliverableView }) {
  if (deliverable.link === null) {
    return (
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        This was delivered as a link, and the address on it is not one we will
        open for you. Ask the professional to send it again.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <a
        className="break-all text-sm font-medium text-brand underline"
        href={deliverable.link}
        target="_blank"
        rel="noreferrer noopener"
      >
        {deliverable.link}
      </a>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        This opens somewhere outside Vsolve. We recorded the address the
        professional gave, and we do not hold the files themselves — so save
        anything you need before you accept.
      </p>
    </div>
  );
}

/**
 * A file on the stage evidence rail, which this screen cannot open.
 *
 * The states are the evidence viewer's, for one reason: it is the same rail and
 * the same scan pipeline, and two screens wording one scan status differently is
 * the failure `features/engagement/view/stage-evidence.tsx` was written to
 * avoid. What is new here is the missing-record case, which matters more on this
 * panel than on that one — a deliverable whose evidence row we cannot find is
 * not something to accept.
 */
function FileDeliverable({ deliverable }: { deliverable: DeliverableView }) {
  if (deliverable.fileRecordMissing) {
    return (
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        We cannot find the record for this file on your project, so we cannot
        tell you anything about it. Do not accept it on the strength of its name
        — contact support.
      </p>
    );
  }

  const file = deliverable.file;
  if (file === null) return null;

  if (file.scanStatus === "PENDING") {
    return (
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary" role="status">
        We are still checking this file is safe. It is not ready to look at yet.
      </p>
    );
  }

  if (file.scanStatus === "INFECTED" || file.scanStatus === "FAILED") {
    return (
      <p className="mt-2 max-w-prose text-sm leading-6 text-danger-text">
        We could not accept this file
        {file.failureReason !== null ? `: ${file.failureReason}` : "."} Ask the professional to send
        it again, and do not accept the delivery until they have.
      </p>
    );
  }

  if (!file.isReadable) {
    return (
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        We cannot tell whether this file is safe to open, so we are not offering it.
      </p>
    );
  }

  return (
    <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
      Checked and accepted, and held by Vsolve. Opening files from this screen is
      not available yet — ask the professional to send it to you as well, or
      contact support and we will. Do not accept a delivery you have not seen.
    </p>
  );
}
