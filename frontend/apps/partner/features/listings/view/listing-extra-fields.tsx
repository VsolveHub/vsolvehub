import { FieldError } from "./field-error";

export interface ListingExtraFieldsProps {
  roleType: string;
  payRange: string;
  workMode: string;
  experienceYears: string;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function ListingExtraFields({
  roleType,
  payRange,
  workMode,
  experienceYears,
  errors = {},
  onChange,
}: ListingExtraFieldsProps) {
  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-text-secondary">Role Type / Employment</label>
        <select
          value={roleType}
          onChange={(e) => onChange("role_type", e.target.value)}
          className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
        >
          <option value="Full-Time">Full-Time</option>
          <option value="Part-Time">Part-Time</option>
          <option value="Contract">Contract</option>
          <option value="Internship">Internship</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">Workplace Mode</label>
        <select
          value={workMode}
          onChange={(e) => onChange("work_mode", e.target.value)}
          className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
        >
          <option value="On-site">On-site</option>
          <option value="Hybrid">Hybrid</option>
          <option value="Remote">Remote</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">Pay Range / Compensation</label>
        <input
          value={payRange}
          onChange={(e) => onChange("pay_range", e.target.value)}
          placeholder="e.g. ₹35,000 - ₹50,000 / month"
          aria-invalid={Boolean(errors.pay_range)}
          className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
            errors.pay_range
              ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
              : "border-line focus:border-line-strong focus:ring-focus-ring"
          }`}
        />
        <FieldError message={errors.pay_range} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary">Experience Required</label>
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
