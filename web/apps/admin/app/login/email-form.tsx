"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@vsolve/ui";
import { sendMagicLink, type AuthState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending link…" : "Send magic link"}
    </Button>
  );
}

export function EmailForm() {
  const [state, action] = useActionState<AuthState, FormData>(sendMagicLink, {});

  if (state.sent) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-muted p-6 text-center">
        <MailCheck className="h-8 w-8 text-brand-600" />
        <p className="text-sm font-medium text-ink-900">Check your email</p>
        <p className="text-sm text-gray-500">
          We sent a sign-in link. Open it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-900">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@vsolvehub.com"
          required
          className="h-12 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <SubmitButton />
      <p className="text-center text-xs text-gray-400">
        Access is restricted to allowlisted VSolveHub admins.
      </p>
    </form>
  );
}
