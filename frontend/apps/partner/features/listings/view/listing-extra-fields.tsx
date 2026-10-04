import { Field, Input, Select } from "@vsolve/ui";

import type { PayMode } from "../model";
import type { JsonSchemaObject } from "../queries";
import { FieldError } from "./field-error";

export interface ListingExtraFieldsProps {
  roleType: string;
  payMode: PayMode;
  salaryMin: string;
  salaryMax: string;
  salaryPeriod: string;
  shift: string;
  experienceYears: string;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  schema?: JsonSchemaObject | null;
}

const PAY_MODES: Array<{ value: PayMode; label: string }> = [
  { value: "range", label: "Pay range" },
  { value: "exact", label: "Exact amount" },
];

export function ListingExtraFields({
  roleType,
  payMode,
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
  const schemaPeriods = schema?.properties?.salary_period?.enum ?? [];
  const periodOptions = schemaPeriods.length > 0 ? schemaPeriods : ["MONTHLY", "YEARLY", "HOURLY"];
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

      <fieldset className="col-span-full">
        <legend className="text-sm font-semibold text-text">Pay</legend>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Pay type">
          {PAY_MODES.map((mode) => {
            const selected = payMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange("pay_mode", mode.value)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "bg-navy-900 text-warm-0 shadow-xs"
                    : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover"
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={`col-span-full grid gap-3 ${payMode === "exact" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <Field
          label={payMode === "exact" ? "Pay" : "Minimum pay"}
          required
          description="Amount in rupees."
        >
          <Input
            inputMode="decimal"
            placeholder={payMode === "exact" ? "e.g. 30000" : "e.g. 25000"}
            value={salaryMin}
            onChange={(e) => onChange("salary_min_rupees", e.target.value)}
            aria-invalid={Boolean(errors.salary_min_rupees)}
          />
          <FieldError message={errors.salary_min_rupees} />
        </Field>
        {payMode === "range" ? (
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
        ) : null}
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
