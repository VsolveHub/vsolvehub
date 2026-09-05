"use client";

import { Field, Input, Textarea } from "@vsolve/ui";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();

  const isNameInvalid =
    draft.displayName.trim().length > 0 && draft.displayName.trim().length < 2;
  const isExperienceMissing = draft.experienceYears <= 0;

  useProceedDisabled(
    draft.displayName.trim().length < 2 || isExperienceMissing,
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Two-column on desktop for short fields */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Full Name */}
        <Field
          required
          label="Full Name"
          error={isNameInvalid ? "Enter at least 2 characters." : undefined}
        >
          <Input
            name="display_name"
            autoComplete="name"
            maxLength={120}
            placeholder="e.g. Ramesh Kumar"
            value={draft.displayName}
            disabled={isReadOnly}
            onChange={(event) => update({ displayName: event.target.value })}
          />
        </Field>

        {/* Years of Experience */}
        <Field required label="Years of Experience">
          <Input
            name="experience_years"
            type="number"
            inputMode="numeric"
            min={1}
            max={80}
            placeholder="e.g. 5"
            value={draft.experienceYears === 0 ? "" : String(draft.experienceYears)}
            disabled={isReadOnly}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              update({
                experienceYears: Number.isNaN(parsed) ? 0 : Math.min(80, Math.max(0, parsed)),
              });
            }}
          />
        </Field>
      </div>

      {/* Bio / About Your Work */}
      <Field label="About Your Work (Bio)">
        <Textarea
          name="biography"
          maxLength={2000}
          rows={4}
          placeholder="Briefly describe your skills, specialities, or certifications (e.g. Certified electrician specializing in home wiring and switchboard repair)."
          value={draft.biography}
          disabled={isReadOnly}
          onChange={(event) => update({ biography: event.target.value })}
        />
        <div className="flex justify-end text-[11px] text-text-muted mt-1">
          <span>{draft.biography.length} / 2000</span>
        </div>
      </Field>
    </div>
  );
}
