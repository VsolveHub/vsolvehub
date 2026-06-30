"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { Field } from "@/components/forms";
import { updateProfile, type FormResult } from "@/app/dashboard/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function ProfileForm({ fullName }: { fullName: string | null }) {
  const [state, action] = useActionState<FormResult, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name" name="fullName" required defaultValue={fullName ?? ""} />
      <div className="flex items-center gap-3">
        <SaveButton />
        {state.ok ? <span className="text-sm text-success">Saved.</span> : null}
        {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
