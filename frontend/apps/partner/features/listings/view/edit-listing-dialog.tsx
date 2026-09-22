import { X } from "lucide-react";
import { PhoneField } from "@vsolve/ui";

import type { EditListingFormState } from "../model";
import type { PartnerListing } from "../queries";
import { FieldError } from "./field-error";
import { ListingExtraFields } from "./listing-extra-fields";

export interface EditListingDialogProps {
  listing: PartnerListing | null;
  onClose: () => void;
  form: EditListingFormState;
  errors: Record<string, string>;
  isPending: boolean;
  onFieldChange: (key: string, value: string) => void;
  onSubmit: () => void;
  serverError?: string;
}

export function EditListingDialog({
  listing,
  onClose,
  form,
  errors,
  isPending,
  onFieldChange,
  onSubmit,
  serverError,
}: EditListingDialogProps) {
  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-bold text-text">Edit Career Opening</h2>
            <p className="text-xs text-text-muted">
              Update details for this opening ({listing.title}).
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
              payRange={form.pay_range}
              workMode={form.work_mode}
              experienceYears={form.experience_years}
              errors={errors}
              onChange={onFieldChange}
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
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-control bg-action px-5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
