"use client";

import { Badge, Button, ErrorState, Field, Input, Sheet } from "@vsolve/ui";
import { useMemo, useState } from "react";

import type { CrewMemberPatch } from "@/features/capability/adapters/wire";

import type { CrewRow } from "../adapters/roster";
import { CrewGenderField, type CrewGender } from "./crew-gender";
import { CrewDocumentUploader } from "./crew-document-uploader";

export interface CrewMemberEditFormProps {
  readonly row: CrewRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (membershipId: string, patch: CrewMemberPatch) => void;
  readonly pending?: boolean;
  readonly submitError?: string | null;
  readonly skillOptions?: readonly { readonly code: string; readonly label: string }[];
}

/**
 * Editing one person on this agency's roster.
 *
 * ## Three fields with three different rules, and the screen says which is which
 *
 * **The name is editable and it is this agency's name for them.** It writes a per-roster label,
 * not the shared crew record, so correcting a typo cannot rename the person on another agency's
 * screen. It used to be read-only for exactly that cross-agency reason, and the advice it gave
 * instead — archive and add the correct person — could not work: re-adding resolves by a hash of
 * the number and hands back the same wrong name.
 *
 * **The number is not editable, and that is not the same gap.** It *is* the identity: it is
 * hashed to resolve one person across every agency roster, which is what makes the same-day
 * double-booking check possible. A different number is a different person.
 *
 * **Gender is editable, and the server decides whether the edit lands.** It is on the shared crew
 * record because a Customer's men/women split is checked against it, so it cannot be per-roster.
 * It used to lock the moment a value existed, which is wrong for the ordinary case: when nobody
 * else has this worker, the record is this agency's alone and the refusal protected no one while
 * leaving them mis-recorded forever.
 *
 * So the field is offered unconditionally and a conflict comes back as `m2_crew_gender_conflict`
 * — a second agency really does have them, and Operations arbitrates with a reason. The screen
 * does **not** ask the server up front whether a worker is shared: that answer is the fact the
 * roster withholds `crew_member_id` to hide, and it would leak on every row instead of only at a
 * genuine disagreement.
 */
export function CrewMemberEditForm({
  row,
  open,
  onOpenChange,
  onSubmit,
  pending = false,
  submitError = null,
  skillOptions = [],
}: CrewMemberEditFormProps) {
  /* Seeded once per mount rather than synced by an effect. The container keys this component on
     the membership being edited, so opening a different person remounts it with their values —
     which is also what stops a half-typed name leaking onto the next person the Partner opens. */
  const [displayName, setDisplayName] = useState(row?.name ?? "");
  const [skillCodes, setSkillCodes] = useState<readonly string[]>(row?.skillCodes ?? []);
  const [isSupervisor, setIsSupervisor] = useState(row?.isSupervisor ?? false);
  const [gender, setGender] = useState<CrewGender>(row?.gender ?? "");

  const trimmedName = displayName.trim();
  const nameProblem = trimmedName === "" ? "Give them a name your team will recognise." : null;

  const hasChanges = useMemo(
    () =>
      row !== null &&
      (trimmedName !== row.name ||
        isSupervisor !== row.isSupervisor ||
        gender !== row.gender ||
        skillCodes.length !== row.skillCodes.length ||
        skillCodes.some((code) => !row.skillCodes.includes(code))),
    [gender, isSupervisor, row, skillCodes, trimmedName],
  );

  if (row === null) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={`Edit ${row.name}`}
      description="Update how this person works with your agency"
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (nameProblem !== null) return;
          onSubmit(row.membershipId, {
            display_name: trimmedName,
            skill_codes: [...skillCodes],
            is_supervisor: isSupervisor,
            gender,
          });
        }}
      >
        <Field
          label="Name"
          description="What your team calls them. Changing it here does not change any other agency's list."
          error={nameProblem ?? undefined}
          required
        >
          <Input
            value={displayName}
            disabled={pending}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
          />
        </Field>

        <div className="rounded-card border border-line bg-surface-sunken p-3">
          <p className="text-sm font-semibold text-text">{row.phoneMasked}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Their mobile number identifies them across agency rosters and stops the same person
            being booked twice on one day, so it cannot be changed. If the number is wrong, that is
            a different person — add them instead.
          </p>
        </div>

        {skillOptions.length > 0 ? (
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-sm font-semibold text-text">
              What they do <span className="font-normal text-text-muted">(optional)</span>
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
                      disabled={pending}
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
            disabled={pending}
            onChange={(event) => setIsSupervisor(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
          />
          <span>
            They can report attendance.
            <span className="mt-0.5 block text-xs leading-5 text-text-muted">
              Supervisors confirm how many crew members turned up each day.
            </span>
          </span>
        </label>

        {submitError ? (
          <ErrorState
            inline
            title="We could not save these changes"
            message={submitError}
            severity="error"
          />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={!hasChanges || nameProblem !== null}
            loading={pending}
            loadingLabel="Saving"
          >
            Save changes
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Outside the form on purpose. An upload is its own command that completes on its own —
          nesting it would put a second submit inside a form whose button says "Save changes",
          and a Partner who uploaded an ID and then pressed Cancel would reasonably believe the
          upload had been cancelled too. It has not; it is already with Operations. */}
      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Identity documents</h3>
          {row.documentsVerified ? (
            <Badge tone="success">Checked by Operations</Badge>
          ) : (
            <Badge tone="warning">Not checked yet</Badge>
          )}
        </div>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Operations checks these before this person can be assigned to customer work. Vsolve staff
          review them — you cannot mark your own crew as checked.
        </p>
        <CrewDocumentUploader row={row} className="mt-3" />
      </div>
    </Sheet>
  );
}
