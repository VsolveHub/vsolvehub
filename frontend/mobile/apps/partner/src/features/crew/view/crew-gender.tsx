// Ported from frontend/apps/partner/features/crew/view/crew-gender.tsx
import { Field, Select } from "@vsolve/mobile-ui";

import type { CrewMemberRecord } from "@/features/capability/adapters/wire";

export type CrewGender = CrewMemberRecord["gender"];

const OPTIONS: readonly { readonly value: CrewGender; readonly label: string }[] = [
  { value: "", label: "Not recorded" },
  { value: "MAN", label: "Man" },
  { value: "WOMAN", label: "Woman" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Prefers not to say" },
];

export function crewGenderLabel(gender: CrewGender): string {
  return OPTIONS.find((option) => option.value === gender)?.label ?? "Not recorded";
}

export function fillsNoGenderedSlot(gender: CrewGender): boolean {
  return gender === "" || gender === "OTHER" || gender === "UNDISCLOSED";
}

export function CrewGenderField({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: CrewGender;
  readonly onChange: (gender: CrewGender) => void;
  readonly disabled?: boolean;
}) {
  return (
    <Field
      label="Man or woman"
      showOptional={false}
      description="Customers booking event staff ask for a number of men and a number of women. Vsolve can only count someone toward that once this is recorded."
    >
      <Select
        value={value}
        disabled={disabled}
        options={OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        onChange={(event) => onChange(event.target.value as CrewGender)}
      />
    </Field>
  );
}
