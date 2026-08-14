"use client";

import { Button, Dialog, Field, Input, Select } from "@vsolve/ui";
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
 * The decline half of `M2-FE-316`. A separate dialog from the enquiry inbox's
 * `DeclineDialog` because it posts a different published vocabulary
 * (`CrewOfferDeclineReasonCodeEnum`, not `InvitationDeclineReasonEnum`) — sharing
 * one component across two enums would mean casting at the seam, which is exactly
 * what deriving the list from the generated type exists to avoid.
 *
 * ## Why the reason is required, said in one honest line
 *
 * ADR-0009 makes the decline rate an Operations **alarm**, not a report: a
 * published rate that has slipped below the street rate makes leads decline
 * everything and the instant product dies quietly. So the reason is not
 * paperwork — it is the only channel this vendor has to move a rate they think is
 * wrong, and the dialog says so rather than asking them to trust that somebody
 * reads it.
 *
 * ## The note is optional and the code is not
 *
 * `CrewOfferDeclineRequest.note` defaults to an empty string. The alarm groups on
 * the code; free text cannot be grouped and would give Operations four spellings
 * of one fact. So the box is there for the thing a code cannot carry, and it is
 * never what the decision is recorded as.
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

  const chosen = findCrewOfferDeclineReason(reasonCode);
  const missing = touched && reasonCode === "";

  const submit = () => {
    setTouched(true);
    // Narrowed against the published vocabulary rather than cast. The `<select>`
    // can only hold a value this component rendered, so a miss here means the
    // enum moved under the build.
    const code = asCrewOfferDeclineReasonCode(reasonCode);
    if (code === null) return;
    onDecline({ reasonCode: code, note: note.trim().slice(0, NOTE_MAX) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pass on this job"
      description="The offer goes to the next lead straight away. You cannot take this one back."
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
            Pass on it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Why are you passing on this one?"
          required
          error={
            missing
              ? "Pick a reason. It is the only way the rate for your city gets looked at."
              : undefined
          }
        >
          <Select
            placeholder="Choose a reason"
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(event.target.value);
              setTouched(true);
            }}
            disabled={pending}
          >
            {CREW_OFFER_DECLINE_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </Select>
        </Field>

        {chosen ? (
          <p className="text-sm leading-6 text-text-secondary">{chosen.consequence}</p>
        ) : null}

        <Field
          label="Anything else we should know? (optional)"
          description="Not required. The reason above is what we act on."
        >
          <Input
            value={note}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            placeholder="e.g. this rate works for me in summer, not in wedding season"
          />
        </Field>

        {error ? (
          <p id={errorId} role="alert" className="text-sm leading-6 text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
