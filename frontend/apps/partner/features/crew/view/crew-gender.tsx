"use client";

import { Field } from "@vsolve/ui";

import type { CrewMemberRecord } from "@/features/capability/adapters/wire";

/**
 * Recording what a worker is, and saying plainly why Vsolve is asking.
 *
 * ## Why the question is on this screen at all
 *
 * A Customer booking event staff sets a men/women split per role, and Vsolve checks it against
 * recorded genders when a lead accepts and again when they name a crew. A worker with nothing on
 * file fills the headcount and no gendered slot — so a roster of blanks passes dispatch and then
 * fails at the gate, on the day, with the job already sold.
 *
 * That is the whole reason this field exists, and it is what the helper text says. A question
 * about somebody's gender with no stated purpose is a question a Partner is right to resent.
 *
 * ## Why "prefer not to say" is offered and what it costs
 *
 * A worker may decline, and the roster has to be able to record that rather than forcing an agency
 * to guess. It is honest, and it is not free: `UNDISCLOSED` fills no gendered slot, exactly like a
 * blank. The difference is that a blank is a question still worth putting to the Partner and this
 * is not. The screen says so rather than letting somebody find out at an assignment refusal.
 *
 * ## Never inferred
 *
 * There is no default and no guess from the name. The empty option is "Not recorded", it is
 * selectable, and it is where every existing worker starts.
 */

export type CrewGender = CrewMemberRecord["gender"];

const OPTIONS: readonly { readonly value: CrewGender; readonly label: string }[] = [
  { value: "", label: "Not recorded" },
  { value: "MAN", label: "Man" },
  { value: "WOMAN", label: "Woman" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Prefers not to say" },
];

/** What the roster badge and the assignment screen call it. */
export function crewGenderLabel(gender: CrewGender): string {
  return OPTIONS.find((option) => option.value === gender)?.label ?? "Not recorded";
}

/** True when this worker cannot fill a man-slot or a woman-slot. */
export function fillsNoGenderedSlot(gender: CrewGender): boolean {
  return gender === "" || gender === "OTHER" || gender === "UNDISCLOSED";
}

export interface CrewGenderFieldProps {
  readonly value: CrewGender;
  readonly onChange: (gender: CrewGender) => void;
  /** True once a gender is on file: it may be filled in, never changed or cleared. */
  readonly locked?: boolean;
  readonly disabled?: boolean;
}

export function CrewGenderField({
  value,
  onChange,
  locked = false,
  disabled = false,
}: CrewGenderFieldProps) {
  return (
    <Field
      label="Man or woman"
      showOptional={false}
      description={
        locked
          ? "Recorded. This is shared with every agency this worker is on, so it cannot be changed here — contact support if it is wrong."
          : "Customers booking event staff ask for a number of men and a number of women. Vsolve can only count someone toward that once this is recorded."
      }
    >
      <select
        value={value}
        disabled={disabled || locked}
        onChange={(event) => onChange(event.target.value as CrewGender)}
        className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-base text-text disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        {OPTIONS.map((option) => (
          <option key={option.value || "blank"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
