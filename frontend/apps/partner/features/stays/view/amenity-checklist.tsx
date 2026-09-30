"use client";

import type { AmenityOption } from "./stay-form-helpers";

/**
 * The facilities a host can tick for any stay type (WiFi, power backup, parking…).
 *
 * The list comes from the server so guests see exactly these labels. Saved as
 * true/false in the property's answers.
 */
export function AmenityChecklist({
  idPrefix,
  options,
  value,
  onChange,
}: {
  idPrefix: string;
  options: readonly AmenityOption[] | undefined;
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  if (!options?.length) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-text">Amenities</legend>
      <p className="text-xs text-text-secondary">Tick what guests get. Leave the rest.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map(({ key, label }) => {
          const id = `${idPrefix}-${key}`;
          return (
            <label
              key={key}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-text has-[:checked]:border-selected has-[:checked]:bg-selected-surface has-[:checked]:font-semibold"
            >
              <input
                id={id}
                type="checkbox"
                className="size-4 accent-current"
                checked={value[key] === true}
                onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
