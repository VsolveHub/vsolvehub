"use client";

import { Field, Input, Textarea } from "@vsolve/ui";

import { useApplicationEditor } from "./application-editor";

/**
 * Who the customer is letting into their home.
 *
 * The display name is the only field here a customer ever sees, so it is asked
 * for as exactly that rather than as "legal name" — the name on the ID is
 * collected as a document, and conflating the two produces applications where
 * the customer is told to expect someone who never introduces themselves that
 * way.
 */

export function AboutStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();

  return (
    <div className="flex flex-col gap-5">
      <Field
        required
        label="Name customers will see"
        description="Usually your first name and surname."
      >
        <Input
          name="display_name"
          autoComplete="name"
          maxLength={120}
          value={draft.displayName}
          disabled={isReadOnly}
          onChange={(event) => update({ displayName: event.target.value })}
        />
      </Field>

      <Field
        label="Years of experience"
        description="Whole years in this trade. An estimate is fine."
      >
        <Input
          name="experience_years"
          type="number"
          inputMode="numeric"
          min={0}
          max={80}
          value={String(draft.experienceYears)}
          disabled={isReadOnly}
          onChange={(event) => {
            // Django accepts 0–80. Clamping here keeps a typed "800" from
            // becoming a round-trip that fails validation.
            const parsed = Number.parseInt(event.target.value, 10);
            update({
              experienceYears: Number.isNaN(parsed) ? 0 : Math.min(80, Math.max(0, parsed)),
            });
          }}
        />
      </Field>

      <Field
        label="About your work"
        description="A few lines about what you do and how long you have done it. Customers read this before booking."
      >
        <Textarea
          name="biography"
          maxLength={2000}
          rows={5}
          value={draft.biography}
          disabled={isReadOnly}
          onChange={(event) => update({ biography: event.target.value })}
        />
      </Field>
    </div>
  );
}
