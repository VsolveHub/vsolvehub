"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { roleLabel } from "@/lib/crew-constants";
import { saveRoleRates, type FormResult } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save rates"}
    </Button>
  );
}

export function PricingEditor({ rates }: { rates: { role: string; rupees: number }[] }) {
  const [state, action] = useActionState<FormResult, FormData>(saveRoleRates, {});
  return (
    <form action={action} className="rounded-2xl border border-border bg-white p-4">
      <p className="text-sm font-semibold text-ink-900">Your day rates</p>
      <p className="mb-3 text-xs text-gray-500">
        Set what you charge per worker per day. Customers comparing quotes see your total at these rates.
      </p>
      <div className="space-y-2">
        {rates.map((r) => (
          <label key={r.role} className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-900">{roleLabel(r.role)}</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400">₹</span>
              <input
                name={`rate_${r.role}`}
                defaultValue={r.rupees}
                inputMode="numeric"
                className="h-10 w-24 rounded-lg border border-border bg-white px-2.5 text-right text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <span className="text-xs text-gray-400">/day</span>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <SaveButton />
        {state.ok ? <span className="text-sm text-success">Saved.</span> : null}
        {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
