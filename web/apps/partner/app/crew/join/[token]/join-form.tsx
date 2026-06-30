"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { Field } from "@/components/forms";
import { confirmJoin, type JoinResult } from "./actions";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full text-base">
      {pending ? "Joining…" : "Yes, I'm joining"}
    </Button>
  );
}

export function JoinForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action] = useActionState<JoinResult, FormData>(confirmJoin, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" name="name" required defaultValue={defaultName} />
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <ConfirmButton />
    </form>
  );
}
