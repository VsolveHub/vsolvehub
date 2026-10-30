"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PhoneField, useT } from "@vsolve/ui";

import type { EditListingFormState } from "../model";
import type { PartnerListing } from "../queries";
import { FieldError } from "./field-error";
import { ListingExtraFields } from "./listing-extra-fields";
import { ListingPreview } from "./listing-preview";

export interface EditListingDialogProps {
  listing: PartnerListing | null;
  onClose: () => void;
  form: EditListingFormState;
  errors: Record<string, string>;
  isPending: boolean;
  onFieldChange: (key: string, value: string) => void;
  onValidate: () => boolean;
  onSubmit: () => boolean;
  serverError?: string;
}

export function EditListingDialog({
  listing,
  onClose,
  form,
  errors,
  isPending,
  onFieldChange,
  onValidate,
  onSubmit,
  serverError,
}: EditListingDialogProps) {
  const t = useT();
  const [step, setStep] = useState<"form" | "preview">("form");

  useEffect(() => {
    setStep("form");
  }, [listing?.id]);

  if (!listing) return null;

  const openPreview = () => {
    if (onValidate()) setStep("preview");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-4xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-bold text-text">{t("listings.editDialog.title")}</h2>
            <p className="text-xs text-text-muted">
              {step === "preview"
                ? t("listings.editDialog.previewHint")
                : t("listings.editDialog.formHint", { title: listing.title })}
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

        {step === "preview" ? (
          <div className="mt-5 space-y-4">
            <ListingPreview
              title={form.title}
              serviceName={listing.service_name}
              location={form.location_text}
              description={form.description}
              payMode={form.pay_mode}
              salaryMin={form.salary_min_rupees}
              salaryMax={form.salary_max_rupees}
              salaryPeriod={form.salary_period}
              experience={form.experience_years}
              roleType={form.role_type}
              shift={form.shift}
            />
            {serverError ? (
              <p role="alert" className="text-xs text-danger-text">
                {serverError}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="rounded-control border border-line px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover"
              >
                {t("listings.createDialog.back")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!onSubmit()) setStep("form");
                }}
                className="inline-flex items-center gap-2 rounded-control bg-action px-5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
              >
                {isPending ? t("listings.createDialog.saving") : t("listings.createDialog.saveChanges")}
              </button>
            </div>
          </div>
        ) : (
        <form
          className="mt-5 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            openPreview();
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-text-secondary">
              {t("listings.createDialog.jobTitle")} <span className="text-danger-text">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
              placeholder={t("listings.createDialog.jobTitlePlaceholder")}
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
              {t("listings.createDialog.jobDescription")} <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
              rows={4}
              placeholder={t("listings.createDialog.jobDescriptionPlaceholder")}
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
                {t("listings.createDialog.locationText")} <span className="text-danger-text">*</span>
              </label>
              <input
                value={form.location_text}
                onChange={(e) => onFieldChange("location_text", e.target.value)}
                placeholder={t("listings.createDialog.locationPlaceholder")}
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
                {t("listings.createDialog.contactPhone")} <span className="text-danger-text">*</span>
              </label>
              <PhoneField
                chrome={false}
                value={form.contact_phone}
                onValueChange={(next) => onFieldChange("contact_phone", next)}
                placeholder="99000 00088"
                aria-label={t("listings.createDialog.contactPhoneAriaLabel")}
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
              payMode={form.pay_mode}
              salaryMin={form.salary_min_rupees}
              salaryMax={form.salary_max_rupees}
              salaryPeriod={form.salary_period}
              shift={form.shift}
              experienceYears={form.experience_years}
              errors={errors}
              onChange={onFieldChange}
              schema={listing?.listing_type_schema}
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
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-control bg-action px-5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
            >
              {t("listings.createDialog.preview")}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
