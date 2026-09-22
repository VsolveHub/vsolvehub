import { X } from "lucide-react";
import { PhoneField } from "@vsolve/ui";

import type { CreateListingFormState } from "../model";
import { FieldError } from "./field-error";
import { ListingExtraFields } from "./listing-extra-fields";

export interface CreateListingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  form: CreateListingFormState;
  errors: Record<string, string>;
  isPending: boolean;
  services: Array<{
    id: string;
    name: string;
    variants?: Array<{ id: string; name: string }>;
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
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Create Career Opportunity</h2>
            <p className="text-xs text-slate-500">
              Fill in the details below. New postings undergo review before going live.
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
              Career Role / Service <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.service_id}
              onChange={(e) => onServiceChange(e.target.value)}
              required
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">Select a career role...</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
            {!form.variant && (
              <p className="mt-1 text-[11px] text-slate-400">
                Select a service from the catalog to configure the role variant.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Listing Title <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
              placeholder="e.g. Senior Python / React Developer"
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
              Job Description & Requirements <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              rows={4}
              placeholder="Describe key responsibilities, qualifications, requirements, and shift timings..."
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
                Location Text <span className="text-rose-500">*</span>
              </label>
              <input
                value={form.location_text}
                onChange={(e) => onFieldChange("location_text", e.target.value)}
                placeholder="e.g. Indiranagar, Bengaluru / Remote"
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
                Contact Phone <span className="text-rose-500">*</span>
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
              disabled={isPending || !form.variant}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Save Draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
