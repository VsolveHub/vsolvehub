import { Field, Input, Select } from "@vsolve/ui";

import type { JsonSchemaObject } from "../queries";
import { FieldError } from "./field-error";

export interface ListingExtraFieldsProps {
  roleType: string;
  salaryMin: string;
  salaryMax: string;
  salaryPeriod: string;
  shift: string;
  experienceYears: string;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  schema?: JsonSchemaObject | null;
}

export function ListingExtraFields({
  roleType,
  salaryMin,
  salaryMax,
  salaryPeriod,
  shift,
  experienceYears,
  errors = {},
  onChange,
  schema,
}: ListingExtraFieldsProps) {
  const roleTypeOptions = schema?.properties?.role_type?.enum ?? [];
  const shiftOptions = schema?.properties?.shift?.enum ?? [];
  const periodOptions = schema?.properties?.salary_period?.enum ?? [];
  const expLabel = schema?.properties?.experience_years?.title || "Experience";

  return (
    <>
      <Field label="Employment type" showOptional={false}>
        <Select value={roleType} onChange={(e) => onChange("role_type", e.target.value)}>
          <option value="">Select employment type</option>
          {roleTypeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
        <FieldError message={errors.role_type} />
      </Field>

      <Field label="Workplace / shift" showOptional={false}>
        <Select value={shift} onChange={(e) => onChange("shift", e.target.value)}>
          <option value="">Select workplace or shift</option>
          {shiftOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
        <FieldError message={errors.shift} />
      </Field>

      <div className="col-span-full grid gap-3 sm:grid-cols-3">
        <Field
          label="Minimum pay"
          required
          description="Amount in rupees."
        >
          <Input
            inputMode="decimal"
            placeholder="e.g. 25000"
            value={salaryMin}
            onChange={(e) => onChange("salary_min_rupees", e.target.value)}
            aria-invalid={Boolean(errors.salary_min_rupees)}
          />
          <FieldError message={errors.salary_min_rupees} />
        </Field>
        <Field label="Maximum pay" required>
          <Input
            inputMode="decimal"
            placeholder="e.g. 40000"
            value={salaryMax}
            onChange={(e) => onChange("salary_max_rupees", e.target.value)}
            aria-invalid={Boolean(errors.salary_max_rupees)}
          />
          <FieldError message={errors.salary_max_rupees} />
        </Field>
        <Field label="Pay period" required>
          <Select
            value={salaryPeriod}
            onChange={(e) => onChange("salary_period", e.target.value)}
            aria-invalid={Boolean(errors.salary_period)}
          >
            <option value="">Select period</option>
            {periodOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "MONTHLY" ? "Monthly" : opt === "YEARLY" ? "Yearly" : opt === "HOURLY" ? "Hourly" : opt}
              </option>
            ))}
          </Select>
          <FieldError message={errors.salary_period} />
        </Field>
      </div>

      <Field label={expLabel} showOptional={false}>
        <Input
          value={experienceYears}
          onChange={(e) => onChange("experience_years", e.target.value)}
          placeholder="e.g. 2+ years"
          aria-invalid={Boolean(errors.experience_years)}
        />
        <FieldError message={errors.experience_years} />
      </Field>
    </>
  );
}
