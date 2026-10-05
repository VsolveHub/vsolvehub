"use client";

import { Field, Input, Select } from "@vsolve/ui";
import { useState } from "react";

export type SchemaProperty = {
  type?: string;
  title?: string;
  enum?: unknown[];
  examples?: unknown[];
};

const OTHER = "__other__";

export function fieldLabel(key: string, spec: SchemaProperty): string {
  const raw = spec.title?.trim() || key.replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * One item detail (colour, material, brand …) from the variant's schema.
 *
 * A field with `enum` or `examples` is a dropdown of the common values plus
 * "Other…", which opens a box for anything not in the list. `examples` never
 * limits what the server accepts, so a typed value always saves.
 */
export function RentalFieldInput({
  fieldKey,
  spec,
  required,
  value,
  onChange,
}: {
  fieldKey: string;
  spec: SchemaProperty;
  required: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  const label = fieldLabel(fieldKey, spec);
  const id = `rental-field-${fieldKey}`;
  const isBoolean = spec.type === "boolean";
  const list = Array.isArray(spec.enum) ? spec.enum : Array.isArray(spec.examples) ? spec.examples : null;
  const options = isBoolean ? ["true", "false"] : (list ?? []).map(String);
  const valueIsCustom = value !== "" && !options.includes(value);
  // "Other" is remembered separately: choosing it clears the value, and an
  // empty value alone would look the same as "nothing chosen yet".
  const [otherMode, setOtherMode] = useState(valueIsCustom);
  const showOther = !isBoolean && (otherMode || valueIsCustom);

  if (options.length === 0) {
    return (
      <Field label={label} required={required} showOptional={false}>
        <Input
          id={id}
          inputMode={spec.type === "number" || spec.type === "integer" ? "numeric" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }

  return (
    <Field label={label} required={required} showOptional={false}>
      <div className="flex flex-col gap-2">
        <Select
          id={id}
          value={showOther ? OTHER : value}
          onChange={(e) => {
            const next = e.target.value;
            if (next === OTHER) {
              setOtherMode(true);
              onChange("");
            } else {
              setOtherMode(false);
              onChange(next);
            }
          }}
        >
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {isBoolean ? (option === "true" ? "Yes" : "No") : option}
            </option>
          ))}
          {isBoolean ? null : <option value={OTHER}>Other…</option>}
        </Select>
        {showOther ? (
          <Input
            id={`${id}-other`}
            aria-label={`Your ${label.toLowerCase()}`}
            value={value}
            autoFocus={otherMode && !valueIsCustom}
            placeholder={`Type the ${label.toLowerCase()}`}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : null}
      </div>
    </Field>
  );
}
