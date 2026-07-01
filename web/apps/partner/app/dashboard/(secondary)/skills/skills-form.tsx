"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { CheckboxCards, SelectField } from "@/components/forms";
import { updateSkills, type FormResult } from "@/app/dashboard/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function SkillsForm({
  tradeName,
  skills,
  cities,
  selectedSkillIds,
  cityId,
}: {
  tradeName: string;
  skills: { id: string; name: string }[];
  cities: { id: string; name: string }[];
  selectedSkillIds: string[];
  cityId: string | null;
}) {
  const [state, action] = useActionState<FormResult, FormData>(updateSkills, {});
  return (
    <form action={action} className="space-y-6">
      <div>
        <p className="mb-1 text-sm font-medium text-ink-900">Your {tradeName} skills</p>
        <p className="mb-2 text-xs text-gray-500">These are based on the service you selected during onboarding.</p>
        <CheckboxCards
          name="skills"
          defaultValues={selectedSkillIds}
          options={skills.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <SelectField
        label="Service area (city)"
        name="cityId"
        defaultValue={cityId ?? ""}
        options={cities.map((c) => ({ value: c.id, label: c.name }))}
      />
      <div className="flex items-center gap-3">
        <SaveButton />
        {state.ok ? <span className="text-sm text-success">Saved.</span> : null}
        {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
