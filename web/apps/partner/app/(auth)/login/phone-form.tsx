"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { requestOtp, type AuthState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending code…" : "Send OTP"}
    </Button>
  );
}

export function PhoneForm({ service, category }: { service?: string; category?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(requestOtp, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      {service ? <input type="hidden" name="service" value={service} /> : null}
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink-900">
          Mobile number
        </label>
        <div className="flex items-center rounded-lg border border-border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="px-3 text-sm font-medium text-gray-500">+91</span>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98765 43210"
            maxLength={11}
            required
            className="h-12 w-full rounded-r-lg bg-transparent pr-3 text-base outline-none"
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <SubmitButton />
      <p className="text-center text-xs text-gray-400">
        By continuing you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  );
}
