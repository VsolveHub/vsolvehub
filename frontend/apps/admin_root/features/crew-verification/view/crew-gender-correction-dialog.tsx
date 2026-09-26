"use client";

import { Button, Card, ErrorState, Field, Input, Sheet } from "@vsolve/ui";
import { useState } from "react";

import type { CrewGender, CrewVerificationRow } from "../queries";

/**
 * Settling a crew gender two agencies disagree about.
 *
 * `CrewMember.gender` is one row per person across every agency that registered them, so the
 * partner-facing rule is first-write-wins: a second agency writing a contradiction is refused
 * with `m2_crew_gender_conflict` rather than silently flipping which gendered slots the first
 * agency can fill. That rule is right, and its refusal message told the partner to *contact
 * support* — while support had no endpoint. A worker recorded wrongly by whichever agency typed
 * first lost gendered work permanently. This is the tool that message always implied.
 *
 * ## Why the reason is mandatory and the value cannot be cleared
 *
 * Unlike a first recording, this overwrites something another agency is already being dispatched
 * against, so the previous value goes into the audit event and the reason goes with it. Clearing
 * is not offered: it would silently re-open every gendered slot the worker had been filling, and
 * there is no honest screen for "I would like to un-know this". A worker who declines to say is
 * `UNDISCLOSED`, which is selectable and fills no gendered slot.
 *
 * ## It is never inferred
 *
 * Not from the name on the roster, not from a document a reviewer just approved, not from a
 * photograph. The only legitimate source is what the worker told somebody, which is why this
 * dialog asks a person to type why they are changing it.
 */
const OPTIONS: readonly { value: Exclude<CrewGender, "">; label: string; note?: string }[] = [
  { value: "MAN", label: "Man" },
  { value: "WOMAN", label: "Woman" },
  { value: "OTHER", label: "Other", note: "Fills the headcount and no gendered slot." },
  {
    value: "UNDISCLOSED",
    label: "Prefers not to say",
    note: "Fills the headcount and no gendered slot.",
  },
];

export interface CrewGenderCorrectionDialogProps {
  readonly row: CrewVerificationRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (gender: Exclude<CrewGender, "">, reason: string) => void;
}

export function CrewGenderCorrectionDialog({
  row,
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: CrewGenderCorrectionDialogProps) {
  /* Seeded at mount, not synced by an effect. The container keys this dialog on the membership,
     so opening a different worker remounts it — which is what stops a reason typed about one
     person being submitted against another. */
  const [gender, setGender] = useState<Exclude<CrewGender, "">>(
    row === null || row.gender === "" ? "MAN" : (row.gender as Exclude<CrewGender, "">),
  );
  const [reason, setReason] = useState("");

  if (row === null) return null;

  const unchanged = row.gender === gender;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={`Correct ${row.crew_member_name}’s record`}
      description={`On ${row.partner_name}’s roster, and on every other agency that has them`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (unchanged || reason.trim() === "") return;
          onSubmit(gender, reason.trim());
        }}
      >
        <Card className="bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
          This is one shared record. Changing it changes which gendered slots{" "}
          <strong className="font-semibold text-text">every</strong> agency with this person can
          fill — not only {row.partner_name}. Only record what the worker has actually said.
        </Card>

        <fieldset className="m-0 border-0 p-0">
          <legend className="text-sm font-semibold text-text">Record them as</legend>
          <div className="mt-2 flex flex-col gap-2">
            {OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line px-3 py-2.5 text-sm text-text-secondary has-[:checked]:border-action has-[:checked]:bg-selected-surface"
              >
                <input
                  type="radio"
                  name="crew-gender"
                  value={option.value}
                  checked={gender === option.value}
                  disabled={pending}
                  onChange={() => setGender(option.value)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-action)]"
                />
                <span>
                  {option.label}
                  {row.gender === option.value ? (
                    <span className="ml-2 text-xs text-text-muted">(recorded now)</span>
                  ) : null}
                  {option.note ? (
                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                      {option.note}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Why are you correcting it?"
          description="Recorded with the previous value, so a reopened dispute can see what changed."
          required
        >
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Partner confirmed by phone; the first agency entered it wrongly"
            disabled={pending}
            autoComplete="off"
          />
        </Field>

        {error ? (
          <ErrorState
            inline
            severity="error"
            title="We could not record this correction"
            message={error}
          />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            loading={pending}
            loadingLabel="Saving"
            disabled={unchanged || reason.trim() === ""}
          >
            {unchanged ? "Already recorded this way" : "Correct the record"}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
