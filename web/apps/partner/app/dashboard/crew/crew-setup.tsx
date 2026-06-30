"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Users } from "lucide-react";
import { Button } from "@vsolve/ui";
import { Field } from "@/components/forms";
import { createCrew, type FormResult } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function CrewSetup({ tradeName }: { tradeName: string }) {
  const [state, action] = useActionState<FormResult, FormData>(createCrew, {});
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <Users className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-bold text-ink-900">Set up your crew</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Create your team profile, then add workers. You stay the single point of contact for every
        job — members only clock in and out.
      </p>
      <form action={action} className="space-y-3">
        <Field label="Crew name" name="name" required placeholder={`e.g. ${tradeName} Crew`} />
        <Field
          label="Equipment you bring (optional)"
          name="equipment"
          placeholder="Drill, ladder, safety gear"
          hint="Separate items with commas"
        />
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <SubmitButton label="Create crew" />
      </form>
    </div>
  );
}
