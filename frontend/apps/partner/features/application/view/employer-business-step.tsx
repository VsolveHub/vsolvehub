"use client";

import type { Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, ChoiceChips, Field, Input, Select, useT } from "@vsolve/ui";
import type { PickedLocation } from "@vsolve/ui/location-picker";
import {
  Building2,
  CheckCircle2,
  ImagePlus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { FindOnMap } from "@/features/location/view/find-on-map";

import {
  CATEGORIES,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  NON_GST_PROOFS,
  SIZES,
  STRUCTURES,
  businessDraft,
  businessPatch,
  businessProblems,
  canContinue,
  gstinProblem,
  isPinCode,
  type BusinessDraft,
  type GstAnswer,
} from "../model/employer-form";
import { useRemoveEmployerLogo, useUpdateEmployerDetails, useUploadEmployerLogo } from "../queries";
import { EmployerFrame, FormSection, useEmployerNav } from "./employer-frame";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

/**
 * "Your business": the names it is shown under, what kind of business it is, whether it has GST, the
 * proof that will be uploaded, where it is (with a pin on the map) and an optional logo and website.
 *
 * Candidates see the trade name (else the legal name), the logo, the industry, the size and the
 * area. The street address and pin code stay with the platform.
 */
export function EmployerBusinessStep() {
  return (
    <EmployerGuard screen="business">
      {(application) => <BusinessForm key={application.version} application={application} />}
    </EmployerGuard>
  );
}

function BusinessForm({ application }: { application: Application }) {
  const t = useT();
  const save = useUpdateEmployerDetails();
  const { goNext } = useEmployerNav(application);
  const saved = businessDraft(application.employer?.business);
  const [draft, setDraft] = useState<BusinessDraft>(saved);

  const problems = businessProblems(draft);
  const gstProblem = gstinProblem(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const pinned = draft.latitude !== "" && draft.longitude !== "";
  const change = (patch: Partial<BusinessDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  };

  function pickGst(answer: GstAnswer) {
    // Yes fixes the proof to the GST certificate; No lets them choose another.
    change({ gst: answer, proof: answer === "yes" ? "GST_CERTIFICATE" : "", gstin: answer === "yes" ? draft.gstin : "" });
  }

  // The pin fills what is still blank; what the employer typed is theirs to keep.
  function onPinned(location: PickedLocation) {
    setDraft((current) => ({
      ...current,
      latitude: location.latitude,
      longitude: location.longitude,
      address: current.address.trim() ? current.address : location.line1 || location.formatted_address,
      area: current.area.trim() ? current.area : location.locality,
      city: current.city.trim() ? current.city : location.city,
      state: current.state.trim() ? current.state : location.state,
      pinCode: current.pinCode.trim() || !isPinCode(location.postal_code) ? current.pinCode : location.postal_code,
    }));
    save.reset();
  }

  function onContinue() {
    if (!dirty) {
      goNext();
      return;
    }
    save.mutate(businessPatch(draft), { onSuccess: goNext });
  }

  return (
    <EmployerFrame
      application={application}
      title={t("apply.steps.employerBusiness")}
      description={t("apply.employer.business.description")}
      canContinue={canContinue(problems)}
      saving={save.isPending}
      error={save.error}
      onContinue={onContinue}
    >
      <FormSection title="Business profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("apply.employer.business.tradeName.label")}
            description={t("apply.employer.business.tradeName.description")}
          >
            <Input
              name="trade_name"
              maxLength={120}
              placeholder="e.g. Sai Electronics"
              value={draft.tradeName}
              onChange={(event) => change({ tradeName: event.target.value })}
            />
          </Field>

          <Field required label={t("apply.employer.business.legalName.label")}>
            <Input
              name="legal_name"
              autoComplete="organization"
              maxLength={200}
              placeholder={t("apply.employer.business.legalName.placeholder")}
              value={draft.legalName}
              onChange={(event) => change({ legalName: event.target.value })}
            />
          </Field>
        </div>

        <Field required label={t("apply.employer.business.structure.label")}>
          <ChoiceChips
            label={t("apply.employer.business.structure.label")}
            name="legal_structure"
            options={STRUCTURES.map((code) => ({
              value: code,
              label: t(`apply.employer.business.structure.${code}`),
            }))}
            value={draft.structure || null}
            onChange={(value) => change({ structure: value })}
          />
        </Field>

        <Field required label={t("apply.employer.business.industry.label")}>
          <ChoiceChips
            label={t("apply.employer.business.industry.label")}
            name="business_category"
            options={CATEGORIES.map((code) => ({
              value: code,
              label: t(`apply.employer.category.${code}`),
            }))}
            value={draft.category || null}
            onChange={(value) => change({ category: value })}
          />
        </Field>

        <Field required label={t("apply.employer.business.size.label")}>
          <ChoiceChips
            label={t("apply.employer.business.size.label")}
            name="company_size"
            options={SIZES}
            value={draft.size || null}
            onChange={(value) => change({ size: value })}
          />
        </Field>
      </FormSection>

      <FormSection title="Registration and tax">
        <Field required label={t("apply.employer.business.gst.label")}>
          <div className="max-w-xs">
            <ChoiceChips
              label={t("apply.employer.business.gst.label")}
              name="gst"
              layout="bar"
              options={[
                { value: "yes", label: t("apply.employer.business.gst.yes") },
                { value: "no", label: t("apply.employer.business.gst.no") },
              ]}
              value={draft.gst || null}
              onChange={(value) => pickGst(value as GstAnswer)}
            />
          </div>
        </Field>

        {draft.gst === "yes" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              required
              label={t("apply.employer.business.gstin.label")}
              description={t("apply.employer.business.gstin.note")}
              error={gstProblem ? t(`apply.employer.business.gstin.problem.${gstProblem}`) : undefined}
            >
              <Input
                name="gstin"
                maxLength={15}
                autoCapitalize="characters"
                placeholder="36AAAAA0000A1Z5"
                value={draft.gstin}
                onChange={(event) => change({ gstin: event.target.value.toUpperCase() })}
              />
            </Field>

            <Field label={t("apply.employer.business.proof.label")} showOptional={false}>
              <div className="flex min-h-11 items-center gap-2.5 rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-text">
                <CheckCircle2 size={16} className="text-action shrink-0" aria-hidden />
                <span>{t("apply.employer.business.proof.GST_CERTIFICATE")}</span>
              </div>
            </Field>
          </div>
        ) : null}

        {draft.gst === "no" ? (
          <Field required label={t("apply.employer.business.proof.label")}>
            <Select
              name="business_proof_type"
              placeholder={t("apply.employer.business.proof.placeholder")}
              value={draft.proof}
              onChange={(event) => change({ proof: event.target.value })}
            >
              {NON_GST_PROOFS.map((code) => (
                <option key={code} value={code}>
                  {t(`apply.employer.business.proof.${code}`)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="flex items-start gap-3 rounded-control bg-surface-sunken p-4 text-xs text-text-secondary">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success-text" aria-hidden />
          <p className="leading-relaxed">
            All business profiles undergo manual review by Operations to award the <strong className="font-semibold text-text">✓ Verified Business</strong> badge on job listings.
          </p>
        </div>
      </FormSection>

      <FormSection title="Workplace location">
        <Field required label={t("apply.employer.business.address.label")}>
          <Input
            name="address"
            autoComplete="street-address"
            maxLength={240}
            placeholder="e.g. Plot 42, Hitec City Main Road"
            value={draft.address}
            onChange={(event) => change({ address: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field required label={t("apply.employer.field.area.label")}>
            <Input
              name="area"
              maxLength={120}
              placeholder="e.g. Madhapur"
              value={draft.area}
              onChange={(event) => change({ area: event.target.value })}
            />
          </Field>
          <Field required label={t("apply.employer.field.city.label")}>
            <Input
              name="city"
              autoComplete="address-level2"
              maxLength={80}
              placeholder="e.g. Hyderabad"
              value={draft.city}
              onChange={(event) => change({ city: event.target.value })}
            />
          </Field>
          <Field required label={t("apply.employer.field.state.label")}>
            <Input
              name="state"
              autoComplete="address-level1"
              maxLength={40}
              placeholder="Telangana"
              value={draft.state}
              onChange={(event) => change({ state: event.target.value })}
            />
          </Field>
          <Field
            required
            label={t("apply.employer.field.pinCode.label")}
            error={problems.invalid.has("pinCode") ? t("apply.employer.field.pinCode.error") : undefined}
          >
            <Input
              name="pin_code"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="500081"
              value={draft.pinCode}
              onChange={(event) => change({ pinCode: event.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>

        <Field required label={t("apply.employer.business.mapPin.label")}>
          <div className="flex flex-col gap-2">
            <FindOnMap
              title={t("apply.employer.business.mapPin.label")}
              pin={pinned ? { latitude: draft.latitude, longitude: draft.longitude } : null}
              onPicked={onPinned}
            />
            {pinned ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-success-text">
                <CheckCircle2 size={14} aria-hidden />
                <span>Workplace location pinned accurately</span>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">{t("apply.employer.business.mapPin.required")}</p>
            )}
          </div>
        </Field>
      </FormSection>

      <FormSection title="Branding (optional)">
        <LogoField application={application} />

        <Field
          label={t("apply.employer.business.website.label")}
          error={problems.invalid.has("websiteUrl") ? t("apply.employer.business.website.error") : undefined}
        >
          <Input
            name="website_url"
            type="url"
            inputMode="url"
            maxLength={300}
            placeholder="https://example.com"
            value={draft.websiteUrl}
            onChange={(event) => change({ websiteUrl: event.target.value })}
          />
        </Field>
      </FormSection>
    </EmployerFrame>
  );
}

/**
 * The optional logo. It is saved the moment it is chosen (the server checks the file's own bytes),
 * separately from the rest of the form, so choosing one never costs what was typed.
 */
function LogoField({ application }: { application: Application }) {
  const t = useT();
  const upload = useUploadEmployerLogo();
  const remove = useRemoveEmployerLogo();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const logoUrl = application.employer?.business?.logo_url ?? "";
  const busy = upload.isPending || remove.isPending;
  const failure = upload.error ?? remove.error;

  function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      setProblem(t("apply.employer.business.logo.wrongType"));
    } else if (file.size > LOGO_MAX_BYTES) {
      setProblem(t("apply.employer.business.logo.tooBig"));
    } else {
      upload.mutate(file);
    }
    // Cleared so choosing the same corrected file fires a change.
    if (input.current) input.current.value = "";
  }

  return (
    <Field
      label={t("apply.employer.business.logo.label")}
      description={t("apply.employer.business.logo.hint")}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-4 rounded-control border border-line p-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={t("apply.employer.business.logo.alt")}
              className="size-14 sm:size-16 rounded-control border border-line object-cover shadow-xs"
            />
          ) : (
            <div className="flex size-14 sm:size-16 items-center justify-center rounded-control border-2 border-dashed border-line-strong bg-surface text-text-muted">
              <Building2 size={22} aria-hidden />
            </div>
          )}
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="sr-only"
            aria-label={t("apply.employer.business.logo.label")}
            disabled={busy}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={upload.isPending}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={15} aria-hidden />
              {logoUrl ? t("apply.employer.business.logo.replace") : t("apply.employer.business.logo.upload")}
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={remove.isPending}
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                <Trash2 size={15} aria-hidden />
                {t("apply.employer.business.logo.remove")}
              </Button>
            ) : null}
          </div>
        </div>
        {problem ? (
          <p role="alert" className="text-sm text-danger-text">
            {problem}
          </p>
        ) : null}
        {failure && !problem ? (
          <p role="alert" className="text-sm text-danger-text">
            {friendlyErrorMessage(failure)}
          </p>
        ) : null}
      </div>
    </Field>
  );
}
