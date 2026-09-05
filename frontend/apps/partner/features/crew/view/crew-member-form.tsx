"use client";

import { Button, Card, ErrorState, Field, Input, Sheet } from "@vsolve/ui";
import { useState } from "react";

import { CrewGenderField, type CrewGender } from "./crew-gender";

import type { CrewProblem, CrewRow } from "../adapters/roster";

/**
 * Adding one person to the roster.
 *
 * Closes the add half of `M2-FE-107`.
 *
 * ## Three fields, because it is filled in on a site
 *
 * Name, number, supervisor. Skills are optional and everything else — documents,
 * availability, per-worker photographs — is asked for later or not at all. A
 * Partner adding four workers before a shift is standing somewhere with one
 * hand free, and a form that takes two minutes per person is one they will fill
 * in with placeholder names.
 *
 * ## Why the number is required and not optional
 *
 * It is the identity. `add_crew_member` hashes it to resolve one person across
 * every agency roster they appear on, which is what makes the same-day
 * double-booking check possible — including a booking made through a different
 * agency. A worker without a number is a worker who can be sold to two customers
 * for the same Tuesday.
 *
 * ## The duplicate hint is a hint
 *
 * Only the last four digits come back from the server, so a match is *probable*
 * and the copy says so. Refusing on it would be a bug the Partner cannot argue
 * with when two workers share a suffix. Django's check is on the full number and
 * is the one that decides.
 */

export interface CrewMemberFormProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: {
    displayName: string;
    phoneE164: string;
    isSupervisor: boolean;
    skillCodes: readonly string[];
    gender: CrewGender;
  }) => void;
  /** Client-side problems from `crewProblems`, computed by the container. */
  readonly problems?: readonly CrewProblem[];
  /** Field errors Django returned. Shown in preference to the local ones. */
  readonly serverProblems?: readonly CrewProblem[];
  /** Someone already on the roster whose number ends the same way. */
  readonly probableDuplicate?: CrewRow | null;
  readonly pending?: boolean;
  readonly submitError?: string | null;
  /** Skills the Partner may tag, from the published M1 reference data. */
  readonly skillOptions?: readonly { readonly code: string; readonly label: string }[];
}

export function CrewMemberForm({
  open,
  onOpenChange,
  onSubmit,
  problems = [],
  serverProblems = [],
  probableDuplicate = null,
  pending = false,
  submitError = null,
  skillOptions = [],
}: CrewMemberFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [skillCodes, setSkillCodes] = useState<readonly string[]>([]);
  /* Blank by default and never guessed from the name. A worker with nothing on file fills the
     headcount and no gendered slot, which the field's own helper text says. */
  const [gender, setGender] = useState<CrewGender>("");

  const messageFor = (field: CrewProblem["field"]) =>
    serverProblems.find((problem) => problem.field === field)?.message ??
    problems.find((problem) => problem.field === field)?.message;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add someone to your crew">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            displayName,
            // Normalised here rather than in the model, so a Partner typing a
            // bare 10-digit number is not told off for a convention nobody
            // explained. The model still validates the result.
            phoneE164: phone.trim().startsWith("+") ? phone.trim() : `+91${phone.replace(/\D/g, "")}`,
            isSupervisor,
            skillCodes,
            gender,
          });
        }}
      >
        <Field
          label="Name"
          description="What your team calls them. Customers do not see it before a shift."
          error={messageFor("display_name")}
          required
        >
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Mobile number"
          description="We use it to make sure nobody is booked twice on the same day."
          error={messageFor("phone_e164")}
          required
        >
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
          />
        </Field>

        {probableDuplicate ? (
          <Card
            aria-live="polite"
            className="bg-surface-sunken p-3 text-sm leading-6 text-text-secondary"
          >
            This looks like <strong className="font-semibold text-text">
              {probableDuplicate.name}
            </strong>
            , who is already on your roster. If it is someone else, carry on — we check the full
            number.
          </Card>
        ) : null}

        {skillOptions.length > 0 ? (
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-sm font-semibold text-text">
              What they do{" "}
              <span className="font-normal text-text-muted">(optional)</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {skillOptions.map((skill) => {
                const selected = skillCodes.includes(skill.code);
                return (
                  <label
                    key={skill.code}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 text-sm text-text-secondary has-[:checked]:border-action has-[:checked]:bg-selected-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setSkillCodes((current) =>
                          selected
                            ? current.filter((code) => code !== skill.code)
                            : [...current, skill.code],
                        )
                      }
                      className="h-4 w-4 accent-[var(--color-action)]"
                    />
                    {skill.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <CrewGenderField value={gender} onChange={setGender} disabled={pending} />

        <label className="flex items-start gap-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isSupervisor}
            onChange={(event) => setIsSupervisor(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
          />
          <span>
            They can report attendance.
            <span className="mt-0.5 block text-xs leading-5 text-text-muted">
              Supervisors confirm how many of the crew turned up each day. You need at least one.
            </span>
          </span>
        </label>

        {submitError ? (
          <ErrorState
            inline
            title="We could not add them"
            message={submitError}
            severity="error"
          />
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" loading={pending} loadingLabel="Adding">
            Add to roster
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
