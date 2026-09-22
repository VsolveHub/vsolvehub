import type { JsonSchemaObject } from "../queries";
import { FieldError } from "./field-error";

export interface ListingExtraFieldsProps {
  roleType: string;
  payRange: string;
  workMode: string;
  experienceYears: string;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  schema?: JsonSchemaObject | null;
}

export function ListingExtraFields({
  roleType,
  payRange,
  workMode,
  experienceYears,
  errors = {},
  onChange,
  schema,
}: ListingExtraFieldsProps) {
  const roleTypeOptions = schema?.properties?.role_type?.enum || [
    "Full-Time",
    "Part-Time",
    "Contract",
    "Internship",
  ];
  const roleTypeLabel = schema?.properties?.role_type?.title || "Role Type / Employment";

  const shiftOptions = schema?.properties?.shift?.enum || [
    "On-site",
    "Hybrid",
    "Remote",
    "Day",
    "Night",
    "Rotational",
  ];
  const shiftLabel = schema?.properties?.shift?.title || "Workplace Mode / Shift";

  const salaryLabel = schema?.properties?.salary_range?.title || "Pay Range / Compensation";
  const expLabel = schema?.properties?.experience_years?.title || "Experience Required";

  const payError = errors.salary_range || errors.pay_range;
  const shiftError = errors.shift || errors.work_mode;

  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-text-secondary">{roleTypeLabel}</label>
        <select
          value={roleType}
          onChange={(e) => onChange("role_type", e.target.value)}
          className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
        >
          {roleTypeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <FieldError message={errors.role_type} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">{shiftLabel}</label>
        <select
          value={workMode}
          onChange={(e) => {
            onChange("shift", e.target.value);
            onChange("work_mode", e.target.value);
          }}
          className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
        >
          {shiftOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <FieldError message={shiftError} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">{salaryLabel}</label>
        <input
          value={payRange}
          onChange={(e) => {
            onChange("salary_range", e.target.value);
            onChange("pay_range", e.target.value);
          }}
          placeholder="e.g. ₹35,000 - ₹50,000 / month"
          aria-invalid={Boolean(payError)}
          className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
            payError
              ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
              : "border-line focus:border-line-strong focus:ring-focus-ring"
          }`}
        />
        <FieldError message={payError} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">{expLabel}</label>
        <input
          value={experienceYears}
          onChange={(e) => onChange("experience_years", e.target.value)}
          placeholder="e.g. 2+ years"
          aria-invalid={Boolean(errors.experience_years)}
          className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
            errors.experience_years
              ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
              : "border-line focus:border-line-strong focus:ring-focus-ring"
          }`}
        />
        <FieldError message={errors.experience_years} />
      </div>
    </>
  );
}
