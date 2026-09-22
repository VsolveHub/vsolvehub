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
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Edit Career Opening</h2>
            <p className="text-xs text-slate-500">
              Update details for this opening ({listing.title}).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
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
            <label className="block text-xs font-semibold text-slate-700">
              Job / Role Title <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
              aria-invalid={Boolean(errors.title)}
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                errors.title
                  ? "border-rose-300 focus:border-rose-500"
                  : "border-slate-200 focus:border-indigo-500"
              }`}
            />
            <FieldError message={errors.title} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              aria-invalid={Boolean(errors.description)}
              className={`mt-1 w-full rounded-lg border p-3 text-sm outline-none ${
                errors.description
                  ? "border-rose-300 focus:border-rose-500"
                  : "border-slate-200 focus:border-indigo-500"
              }`}
            />
            <FieldError message={errors.description} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Location / Work City
              </label>
              <input
                value={form.location_text}
                onChange={(e) => onFieldChange("location_text", e.target.value)}
                aria-invalid={Boolean(errors.location_text)}
                className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                  errors.location_text
                    ? "border-rose-300 focus:border-rose-500"
                    : "border-slate-200 focus:border-indigo-500"
                }`}
              />
              <FieldError message={errors.location_text} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Direct Contact Phone <span className="text-rose-500">*</span>
              </label>
              <PhoneField
                chrome={false}
                value={form.contact_phone}
                onValueChange={(next) => onFieldChange("contact_phone", next)}
                placeholder="99000 00088"
                aria-label="Contact phone"
                aria-invalid={Boolean(errors.contact_phone)}
                className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                  errors.contact_phone
                    ? "border-rose-300 focus:border-rose-500"
                    : "border-slate-200 focus:border-indigo-500"
                }`}
              />
              <FieldError message={errors.contact_phone} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => onFieldChange("contact_email", e.target.value)}
                aria-invalid={Boolean(errors.contact_email)}
                className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                  errors.contact_email
                    ? "border-rose-300 focus:border-rose-500"
                    : "border-slate-200 focus:border-indigo-500"
                }`}
              />
              <FieldError message={errors.contact_email} />
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
            <p role="alert" className="text-xs text-red-600">
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !form.title}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
