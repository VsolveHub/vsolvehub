"use client";

import { Field, Input, Select } from "@vsolve/ui";

import { labelFor, schemaPropertyMap, schemaRequiredKeys } from "./stay-form-helpers";

/**
 * Renders the server's questions for a property or a room.
 *
 * The list is whatever the category schema publishes; nothing here knows which
 * category it is, so a new category needs no client change.
 */
export function SchemaQuestions({
  idPrefix,
  schema,
  answers,
  onChange,
  columns = 2,
}: {
  idPrefix: string;
  schema: Record<string, unknown> | undefined;
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  columns?: 2 | 3;
}) {
  const props = schemaPropertyMap(schema);
  const required = schemaRequiredKeys(schema);
  const keys = Object.keys(props);
  if (keys.length === 0) return null;

  return (
    <section className={`grid gap-3 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {keys.map((key) => {
        const spec = props[key] ?? {};
        const enums = Array.isArray(spec.enum) ? spec.enum.map(String) : null;
        const id = `${idPrefix}-${key}`;
        const set = (value: string) => onChange({ ...answers, [key]: value });
        if (enums || spec.type === "boolean") {
          const options = enums ?? ["true", "false"];
          return (
            <Field key={key} label={labelFor(key)} required={required.has(key)} showOptional={false}>
              <Select id={id} value={answers[key] ?? ""} onChange={(e) => set(e.target.value)}>
                <option value="">Select</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {spec.type === "boolean" ? (option === "true" ? "Yes" : "No") : option}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        return (
          <Field key={key} label={labelFor(key)} required={required.has(key)} showOptional={false}>
            <Input
              id={id}
              inputMode={spec.type === "number" ? "numeric" : "text"}
              value={answers[key] ?? ""}
              onChange={(e) => set(e.target.value)}
            />
          </Field>
        );
      })}
    </section>
  );
}
