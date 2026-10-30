"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "./button";
import { Dialog } from "./dialog";
import { useTOrDefault } from "./i18n";

/**
 * The one confirmation step before an irreversible or financial action.
 *
 * ## Why this is a component and not a convention
 *
 * "Are you sure?" written per screen drifts. One screen ends up confirming a
 * refund with the same weight as a filter reset; another confirms nothing at
 * all. Worse, the sentence that actually matters — what this costs, and whether
 * it can be undone — is the one most likely to be left out, because the person
 * writing the dialog already knows.
 *
 * So `consequence` is required. A confirmation that cannot state what happens
 * next is not a confirmation, it is a speed bump.
 *
 * ## The flow-weight budget
 *
 * M2 allows exactly **one** confirmation step before a submit, and the
 * requirement's review screen *is* that step. This component is for the
 * irreversible actions further in — rejecting a quote, disputing a stage,
 * cancelling after contact disclosure — not for adding a second gate to a flow
 * that already has its own. Using it on a submit path is a flow-weight
 * regression (`M2-FE-806`).
 *
 * ## Typed confirmation
 *
 * `confirmPhrase` requires the person to type a word before the action unlocks.
 * Reserved for the genuinely unrecoverable — it is friction, and friction spent
 * where it is not needed is friction nobody reads by the time it is.
 *
 * ## While it is running
 *
 * The dialog stays open and non-dismissable, because the outcome is the thing
 * the person came for. Closing on click and reporting the result elsewhere is
 * how someone taps twice and disputes a stage they meant to dispute once.
 */

export interface ConfirmActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is about to happen. "Reject this quote", not "Confirm". */
  title: string;
  /**
   * The consequence, stated plainly and truthfully.
   *
   * Required. Say what changes, what it costs, and whether it can be undone —
   * including when the honest answer is that it cannot.
   */
  consequence: ReactNode;
  /** The button that performs it. Names the action, never "OK". */
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** In flight. Keeps the dialog open and blocks a second submission. */
  pending?: boolean;
  /**
   * Marks the action destructive, which colours the confirm button.
   *
   * Colour is reinforcement only — `consequence` already carries the meaning, so
   * the dialog reads the same in greyscale.
   */
  destructive?: boolean;
  /** Word the person must type to unlock the action. For the unrecoverable only. */
  confirmPhrase?: string;
  /** Extra detail: an amount breakdown, the evidence being submitted. */
  children?: ReactNode;
}

export function ConfirmAction({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  cancelLabel,
  pending = false,
  destructive = false,
  confirmPhrase,
  children,
}: ConfirmActionProps) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const tf = useTOrDefault();
  const resolvedCancelLabel = cancelLabel ?? tf("ui.confirmAction.goBack", "Go back");

  const unlocked = confirmPhrase === undefined || typed.trim() === confirmPhrase;

  const close = () => {
    // Resetting on close rather than on open: a re-opened dialog that still
    // holds the phrase from last time is one tap from an action the person has
    // not re-considered.
    setTyped("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
      // Dismissal during the request would leave the outcome unreported.
      dismissable={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={!unlocked}
            loading={pending}
            loadingLabel={tf("ui.confirmAction.working", "Working")}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-6 text-text-secondary">{consequence}</div>

      {children ? <div className="mt-4">{children}</div> : null}

      {confirmPhrase !== undefined ? (
        <div className="mt-4">
          <label htmlFor={inputId} className="block text-sm font-medium text-text">
            {tf("ui.confirmAction.typeToConfirm.prefix", "Type")}{" "}
            <span className="font-bold">{confirmPhrase}</span>{" "}
            {tf("ui.confirmAction.typeToConfirm.suffix", "to confirm")}
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            // Autocorrect on a phone rewrites the phrase as you type it and the
            // button never unlocks, with nothing on screen explaining why.
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1.5 h-12 w-full rounded-control border border-line bg-surface px-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-action"
          />
        </div>
      ) : null}
    </Dialog>
  );
}
