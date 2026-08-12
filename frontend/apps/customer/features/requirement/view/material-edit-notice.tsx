"use client";

import { Button } from "@vsolve/ui";
import { useState } from "react";

/**
 * What changing a request costs, once it has left your hands — `M2-FE-211`,
 * `GAP-015`.
 *
 * ## The rule this exists to make visible
 *
 * `CustomerRequirement.is_editable_freely` is `status == DRAFT`, and it is
 * called *freely* rather than *possible* for a reason: before matching, an edit
 * changes a document nobody has read. After it, the same edit reaches
 * professionals who have already spent time on the old version — read it,
 * priced it, sometimes travelled to look at it — and it restarts the clock they
 * were answering against. A Customer who changes "3 workers" to "6" without
 * being told that is not making an informed decision; they are making one for
 * other people.
 *
 * So the consequence is stated **before** the Customer commits to the edit, not
 * as a toast afterwards, and a material edit takes an explicit confirmation.
 * That is the whole of `M2-FE-211` and it is the half that does not depend on
 * an endpoint.
 *
 * ## Why the confirm path is built but not supplied
 *
 * There is no edit-after-submission command at contract 1.21.0. `PATCH
 * /requirements/{id}/` refuses with `409 m2_requirement_locked` the moment a
 * requirement leaves `DRAFT`, and no other route amends one. So on a
 * vendor-visible request this renders the **explanation plus the honest route**
 * — support, who can do it — and never a button that would collect a
 * confirmation and then fail.
 *
 * `onConfirmEdit` is the seam. When the amend command publishes, the request
 * detail passes it and the confirmation below lights up; nothing else in this
 * file changes. A confirmation wired to a command that answers 409 would be
 * worse than no confirmation at all: it would teach the Customer that
 * confirming does nothing.
 */

export type MaterialEditStance =
  /** Nobody has seen it. Editing is free, silent and needs no ceremony. */
  | "free"
  /** Professionals hold this version. An edit reaches them and resets their clock. */
  | "vendor_visible"
  /** Nothing more will happen to it, so there is nothing to edit. */
  | "closed";

export interface MaterialEditNoticeProps {
  stance: MaterialEditStance;
  /** Resume the four screens. Supplied only where a free edit is possible. */
  onEditFreely?: () => void;
  /**
   * Apply a material edit after the Customer has confirmed it.
   *
   * Absent while no amend command exists — see the note above. Supplying it is
   * what turns this from an explanation into an action.
   */
  onConfirmEdit?: () => void;
  /** Where a Customer goes when only a person can help. */
  supportAction?: React.ReactNode;
}

export function MaterialEditNotice({
  stance,
  onEditFreely,
  onConfirmEdit,
  supportAction,
}: MaterialEditNoticeProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (stance === "closed") return null;

  if (stance === "free") {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="font-semibold text-text">You can still change this</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Nobody has seen this request yet, so changing it costs nothing and
          nobody is told.
        </p>
        {onEditFreely !== undefined ? (
          <Button className="mt-3" variant="secondary" onClick={onEditFreely}>
            Continue editing
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-warning-line bg-warning-surface p-4">
      <p className="font-semibold text-text">Changing this now affects the people quoting</p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Professionals already have this request. If the job itself changes — how
        many people, how long, what has to be done — everyone who was asked is
        told, and the time they have to reply starts again from the change.
        Anyone who had already quoted the old version has to redo it.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Correcting a phone number or adding a note does none of that. It is
        changing the job that resets the clock.
      </p>

      {onConfirmEdit === undefined ? (
        <>
          <p className="mt-3 max-w-prose text-sm leading-6 text-text">
            Changing a request that is already with professionals has to go
            through us at the moment. Tell us what needs to change and we will
            handle telling them.
          </p>
          {supportAction !== undefined ? <div className="mt-3">{supportAction}</div> : null}
        </>
      ) : isConfirming ? (
        <div className="mt-3 rounded-control border border-line bg-surface p-3">
          <p className="max-w-prose text-sm leading-6 text-text">
            Everyone who was asked will be told this changed, and their reply
            deadline restarts. Quotes already sent for the old version no longer
            apply.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={onConfirmEdit}>Yes, change it and tell them</Button>
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              Leave it as it is
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" variant="secondary" onClick={() => setIsConfirming(true)}>
          Change this request
        </Button>
      )}
    </div>
  );
}
