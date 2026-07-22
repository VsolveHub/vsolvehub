"use client";

import { useActionState } from "react";
import { addMapping, type SimpleFormState } from "../actions";

type CategoryGroup = {
  name: string;
  subCategories: { id: string; name: string }[];
  services: { id: string; name: string }[];
};

export function AddMappingForm({
  productId,
  serviceCategories,
}: {
  productId: string;
  serviceCategories: CategoryGroup[];
}) {
  const [state, formAction, pending] = useActionState<SimpleFormState, FormData>(addMapping, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="min-w-64 flex-1">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Map to service or subcategory
        </label>
        <select
          name="target"
          required
          defaultValue=""
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="" disabled>
            Choose…
          </option>
          {serviceCategories.map((cat) => (
            <optgroup key={cat.name} label={cat.name}>
              {cat.subCategories.map((s) => (
                <option key={`sub-${s.id}`} value={`subcategory:${s.id}`}>
                  {s.name} (whole subcategory)
                </option>
              ))}
              {cat.services.map((s) => (
                <option key={`svc-${s.id}`} value={`service:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <label className="flex h-10 items-center gap-2 text-sm font-medium text-ink-900">
        <input type="checkbox" name="featured" className="h-4 w-4" />
        Featured
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add mapping"}
      </button>
      {state.error ? <p className="w-full text-sm font-medium text-red-600">{state.error}</p> : null}
    </form>
  );
}
