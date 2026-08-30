"use client";

import { Button, Dialog, Disclosure, Input, cn } from "@vsolve/ui";
import { useId, useState } from "react";

import {
  CREW_OFFER_DECLINE_REASONS,
  asCrewOfferDeclineReasonCode,
  findCrewOfferDeclineReason,
  type CrewOfferDeclineReasonCode,
} from "../model/decline-reasons";

/**
 * Passing on a crew offer, with the reason the rate card is reviewed from.
 *
 * A separate dialog from the enquiry inbox's `DeclineDialog` because it posts a
 * different published vocabulary (`CrewOfferDeclineReasonCodeEnum`).
 *
 * ## Tiles, not a select
 *
 * A lead answering on a two-minute clock gets one tap per reason. The chosen
 * tile shows its one-line consequence beneath the grid — the truth about what
 * Vsolve does with the answer, which is what makes the required field honest.
 * ADR-0009 makes the decline rate an Operations **alarm**: `RATE_TOO_LOW` is the
 * only channel this vendor has to move a rate they think is wrong.
 *
 * ## The note is optional and the code is not
 *
 * The alarm groups on the code; free text cannot be grouped. The note is behind
 * a disclosure so the dialog stays a grid and two buttons.
 */

export interface CrewOfferDeclineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecline: (input: { reasonCode: CrewOfferDeclineReasonCode; note: string }) => void;
  readonly pending: boolean;
  /** A refusal from the last attempt, already presented. Kept visible in the dialog. */
  readonly error?: string | null;
}

/** Matches the server's own `max_length` on the note field. */
const NOTE_MAX = 500;

export function CrewOfferDeclineDialog({
  open,
  onOpenChange,
  onDecline,
  pending,
  error,
}: CrewOfferDeclineDialogProps) {
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const errorId = useId();
  const groupId = useId();

  const chosen = findCrewOfferDeclineReason(reasonCode);
  const missing = touched && reasonCode === "";

  const submit = () => {
    setTouched(true);
    // Narrowed against the published vocabulary rather than cast. A tile can
    // only hold a value this component rendered, so a miss means the enum
    // moved under the build.
    const code = asCrewOfferDeclineReasonCode(reasonCode);
    if (code === null) return;
    onDecline({ reasonCode: code, note: note.trim().slice(0, NOTE_MAX) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pass on this job?"
      description="It goes to the next lead. No way back."
      // Dismissable: nothing has been sent yet, and trapping a lead in a dialog
      // they opened by accident is its own failure.
      dismissable
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={pending}
            loadingLabel="Passing"
            disabled={pending}
          >
            Pass
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-2">
          <span id={groupId} className="text-sm font-semibold text-text">
            Why?
          </span>
          <div className="grid grid-cols-2 gap-2">
            {CREW_OFFER_DECLINE_REASONS.map((reason) => {
              const selected = reason.code === reasonCode;
              return (
                <button
                  key={reason.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={pending}
                  onClick={() => {
                    setReasonCode(reason.code);
                    setTouched(true);
                  }}
                  className={cn(
                    "flex min-h-14 items-center justify-center rounded-2xl border px-3 py-2 text-center text-sm font-semibold leading-snug",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60",
                    selected
                      ? "border-action-line bg-action-surface text-text"
                      : "border-line bg-surface text-text-secondary",
                  )}
                >
                  {reason.label}
                </button>
              );
            })}
          </div>
          {missing ? (
            <p role="alert" className="text-sm leading-5 text-danger-text">
              Pick one — it is how the rate gets looked at.
            </p>
          ) : null}
        </div>

        {chosen ? (
          <p className="text-sm leading-5 text-text-secondary">{chosen.consequence}</p>
        ) : null}

        <Disclosure summary="Add a note?" hint="Optional">
          <Input
            aria-label="Note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            placeholder="e.g. works in summer, not wedding season"
          />
        </Disclosure>

        {error ? (
          <p id={errorId} role="alert" className="text-sm leading-5 text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
