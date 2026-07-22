"use client";

import { useActionState } from "react";
import { createProductCategory, createBrand, type SimpleFormState } from "./actions";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function QuickForm({
  title,
  action,
  withIcon,
}: {
  title: string;
  action: (prev: SimpleFormState, fd: FormData) => Promise<SimpleFormState>;
  withIcon?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SimpleFormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-2 rounded-xl border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="flex gap-2">
        <input name="name" placeholder="Name" required className={inputCls} />
        {withIcon ? <input name="icon" placeholder="Icon (emoji)" className={`${inputCls} w-28`} /> : null}
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-border bg-surface-muted px-3 text-sm font-semibold text-ink-900 hover:bg-gray-100 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {state.error ? <p className="text-xs font-medium text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs font-medium text-green-700">Added.</p> : null}
    </form>
  );
}

/** Inline creation of product categories and brands so a new product never
 *  requires leaving the form (no separate CRUD screens needed for these). */
export function QuickCreatePanel() {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <QuickForm title="New product category" action={createProductCategory} withIcon />
      <QuickForm title="New brand" action={createBrand} />
    </div>
  );
}
