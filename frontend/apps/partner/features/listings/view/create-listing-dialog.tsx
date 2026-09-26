import { X } from "lucide-react";
import { PhoneField } from "@vsolve/ui";

import type { CatalogServiceItem, JsonSchemaObject } from "../queries";
import type { CreateListingFormState } from "../model";
import { FieldError } from "./field-error";
import { ListingExtraFields } from "./listing-extra-fields";

export interface CreateListingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  form: CreateListingFormState;
  errors: Record<string, string>;
  isPending: boolean;
  services: CatalogServiceItem[] | Array<{
    id: string;
    name: string;
    variants?: Array<{
      id: string;
      name: string;
      listing_type_schema?: JsonSchemaObject;
    }>;
  }>;
  onFieldChange: (key: string, value: string) => void;
  onServiceChange: (serviceId: string) => void;
  onSubmit: () => void;
  serverError?: string;
}

export function CreateListingDialog({
  isOpen,
  onClose,
  form,
  errors,
  isPending,
  services,
  onFieldChange,
  onServiceChange,
  onSubmit,
  serverError,
}: CreateListingDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-4xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Post a job</h2>
            <p className="text-xs text-text-muted">
              Designation, location, experience, and pay — the same facts applicants see on Naukri or Indeed.
              Pay is entered in rupees and stored as paise.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-text-muted hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          className="mt-5 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Career Role / Service <span className="text-danger-text">*</span>
            </label>
            <select
              value={form.service_id}
              onChange={(e) => onServiceChange(e.target.value)}
              required
              className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
            >
              <option value="">Select a career role...</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
            {!form.variant && (
              <p className="mt-1 text-[11px] text-text-muted">
                Select a service from the catalog to configure the role variant.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Listing Title <span className="text-danger-text">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
              placeholder="e.g. Senior Python / React Developer"
              aria-invalid={Boolean(errors.title)}
              className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                errors.title
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={errors.title} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              Job Description & Requirements <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              rows={4}
              placeholder="Describe key responsibilities, qualifications, requirements, and shift timings..."
              aria-invalid={Boolean(errors.description)}
              className={`mt-1 w-full rounded-control border bg-surface p-3 text-sm text-text outline-none transition focus:ring-1 ${
                errors.description
                  ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                  : "border-line focus:border-line-strong focus:ring-focus-ring"
              }`}
            />
            <FieldError message={errors.description} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Location Text <span className="text-danger-text">*</span>
              </label>
              <input
                value={form.location_text}
                onChange={(e) => onFieldChange("location_text", e.target.value)}
                placeholder="e.g. Indiranagar, Bengaluru / Remote"
                aria-invalid={Boolean(errors.location_text)}
                className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                  errors.location_text
                    ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                    : "border-line focus:border-line-strong focus:ring-focus-ring"
                }`}
              />
              <FieldError message={errors.location_text} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary">
                Contact Phone <span className="text-danger-text">*</span>
              </label>
              <PhoneField
                chrome={false}
                value={form.contact_phone}
                onValueChange={(next) => onFieldChange("contact_phone", next)}
                placeholder="99000 00088"
                aria-label="Contact phone"
                aria-invalid={Boolean(errors.contact_phone)}
                className={`mt-1 h-10 w-full rounded-control border bg-surface px-3 text-sm text-text outline-none transition focus:ring-1 ${
                  errors.contact_phone
                    ? "border-danger-line focus:border-danger-text focus:ring-danger-text"
                    : "border-line focus:border-line-strong focus:ring-focus-ring"
                }`}
              />
              <FieldError message={errors.contact_phone} />
            </div>

            <ListingExtraFields
              roleType={form.role_type}
              salaryMin={form.salary_min_rupees}
              salaryMax={form.salary_max_rupees}
              salaryPeriod={form.salary_period}
              shift={form.shift}
              experienceYears={form.experience_years}
              errors={errors}
              onChange={onFieldChange}
              schema={
                services
                  .flatMap((s) => s.variants ?? [])
                  .find((v) => v.id === form.variant)?.listing_type_schema
              }
            />
          </div>

          {serverError && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-xs text-danger-text">
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-line px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !form.variant}
              className="inline-flex items-center gap-2 rounded-control bg-action px-5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Save Draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
