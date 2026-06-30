"use client";

import { useActionState } from "react";
import { CheckboxCards, SelectField, FileDrop, StepActions } from "@/components/forms";
import { saveSkills, type StepState } from "../actions";

export function SkillsStep({
  skills,
  cities,
  selectedSkillIds,
  cityId,
}: {
  skills: { id: string; name: string }[];
  cities: { id: string; name: string }[];
  selectedSkillIds: string[];
  cityId: string | null;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveSkills, {});

  return (
    <form action={action} className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-ink-900">Your skills</p>
        <CheckboxCards
          name="skills"
          defaultValues={selectedSkillIds}
          options={skills.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>

      <SelectField
        label="Service area (city)"
        name="cityId"
        required
        defaultValue={cityId ?? ""}
        options={cities.map((c) => ({ value: c.id, label: c.name }))}
      />

      <FileDrop name="tradeCert" label="Trade certificate / proof of skill" />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <StepActions submitLabel="Submit Application" />
    </form>
  );
}
