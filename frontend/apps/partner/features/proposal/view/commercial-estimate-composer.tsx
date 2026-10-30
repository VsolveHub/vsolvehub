"use client";

import {
  Button,
  Dialog,
  Disclosure,
  ErrorState,
  Field,
  Input,
  Select,
  Sheet,
  Textarea,
  cn,
  formatMoney,
  useT,
} from "@vsolve/ui";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Pictogram } from "@/components/pictogram";

import {
  CHARGE_OPTIONS,
  EMPTY_COMMERCIAL_ESTIMATE,
  ESTIMATE_UNITS,
  allocatedInstallmentSubtotal,
  authorizedChargeSubtotal,
  clearCommercialEstimate,
  commercialEstimateFingerprint,
  hasCommercialEstimateErrors,
  hasEnteredModeData,
  itemLineAmount,
  labourLineAmount,
  loadCommercialEstimate,
  materialLineAmount,
  materialSubtotal,
  newInstallment,
  newItemLine,
  newLabourLine,
  newMaterialLine,
  partnerServiceSubtotal,
  saveCommercialEstimate,
  selectedLineSubtotal,
  toCommercialPreviewRequest,
  validateCommercialEstimate,
  type CommercialEstimateDraft,
  type EstimateMode,
  type InstallmentDraft,
  type ItemLineDraft,
  type LabourLineDraft,
  type MaterialLineDraft,
  type OtherChargeDraft,
  type ProposalRequest,
} from "../model/commercial-estimate-draft";
import {
  EXCLUSION_CHOICES,
  INCLUSION_CHOICES,
  materialPresetsFor,
  workPresetsFor,
} from "../model/estimate-presets";
import { paiseToRupeeInput, rupeesToPaise } from "../model/proposal-draft";
import { useProposalFinancialPreview } from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";

export interface CommercialEstimateComposerProps {
  readonly invitationId: string;
  readonly siteVisitId: string;
  readonly serviceName: string;
  readonly archetype: string;
  readonly isSubmitting: boolean;
  readonly onSend: (request: ProposalRequest) => void;
  readonly notice?: React.ReactNode;
}

type Picker = "work" | "material" | null;

/**
 * A preset's caption in the vendor's language. The preset's own `label` /
 * `sentence` is the wire wording and is what goes into the draft; only the chip
 * text is translated. Unknown codes read as the wire label.
 */
function presetCaption(
  t: ReturnType<typeof useT>,
  kind: "work" | "material" | "exclusion" | "inclusion",
  preset: { readonly code: string; readonly label: string },
): string {
  const key = `proposal.commercialComposer.preset.${kind}.${preset.code}`;
  const caption = t(key);
  return caption === key ? preset.label : caption;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function CommercialEstimateComposer({
  invitationId,
  siteVisitId,
  serviceName,
  archetype,
  isSubmitting,
  onSend,
  notice,
}: CommercialEstimateComposerProps) {
  const t = useT();
  const [draft, setDraft] = useState<CommercialEstimateDraft>(
    () => loadCommercialEstimate(invitationId) ?? EMPTY_COMMERCIAL_ESTIMATE,
  );
  const [attempted, setAttempted] = useState(false);
  const [pendingMode, setPendingMode] = useState<EstimateMode | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [previewing, setPreviewing] = useState(false);
  const idCounter = useRef(0);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const workPresets = workPresetsFor(archetype);
  const materialPresets = materialPresetsFor(archetype);

  function id(kind: string): string {
    idCounter.current += 1;
    return `${kind}-${Date.now()}-${idCounter.current}`;
  }

  const errors = useMemo(() => validateCommercialEstimate(draft, t), [draft, t]);
  const previewBody = useMemo(() => {
    if (hasCommercialEstimateErrors(errors)) return null;
    return toCommercialPreviewRequest({ invitationId, siteVisitId, draft });
  }, [draft, errors, invitationId, siteVisitId]);
  const currentFingerprint = previewBody === null ? "incomplete" : commercialEstimateFingerprint(previewBody);
  const debouncedPreview = useDebounced(
    previewBody === null
      ? null
      : { body: previewBody, fingerprint: currentFingerprint },
    450,
  );
  const preview = useProposalFinancialPreview({
    invitationId,
    fingerprint: debouncedPreview?.fingerprint ?? "incomplete",
    body: debouncedPreview?.body ?? null,
  });
  const previewIsCurrent =
    preview.data !== undefined &&
    debouncedPreview !== null &&
    debouncedPreview.fingerprint === currentFingerprint;

  useEffect(() => {
    saveCommercialEstimate(invitationId, draft);
  }, [draft, invitationId]);

  function applyMode(mode: EstimateMode) {
    setDraft((current) => ({
      ...current,
      mode,
      itemLines: mode === "ITEM_WISE" ? [newItemLine(id("item"), "", serviceName)] : [],
      labourLines: mode === "LABOUR_WISE" ? [newLabourLine(id("labour"))] : [],
      installments: [newInstallment(id("installment"))],
    }));
    setPendingMode(null);
    setAttempted(false);
  }

  function chooseMode(mode: EstimateMode) {
    if (mode === draft.mode) return;
    if (draft.mode !== null && hasEnteredModeData(draft)) {
      setPendingMode(mode);
      return;
    }
    applyMode(mode);
  }

  function focusFirstError() {
    window.requestAnimationFrame(() => {
      errorSummaryRef.current?.focus();
      document
        .querySelector<HTMLElement>("[data-estimate-error] input, [data-estimate-error] select")
        ?.focus();
    });
  }

  function submit() {
    setAttempted(true);
    if (hasCommercialEstimateErrors(errors) || !previewIsCurrent || previewBody === null) {
      focusFirstError();
      return;
    }
    onSend(previewBody);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {notice}

      <ModeChooser value={draft.mode} onChange={chooseMode} />

      {attempted && errors.mode ? (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert">
          <ErrorState
            inline
            title={t("proposal.commercialComposer.choosePricingTitle")}
            message={errors.mode}
            severity="error"
          />
        </div>
      ) : null}

      {draft.mode === "ITEM_WISE" ? (
        <ItemLines
          lines={draft.itemLines}
          errors={attempted ? errors : {}}
          disabled={isSubmitting}
          onChange={(itemLines) => setDraft((current) => ({ ...current, itemLines }))}
          onAdd={() => setPicker("work")}
        />
      ) : null}

      {draft.mode === "LABOUR_WISE" ? (
        <LabourLines
          lines={draft.labourLines}
          errors={attempted ? errors : {}}
          disabled={isSubmitting}
          onChange={(labourLines) => setDraft((current) => ({ ...current, labourLines }))}
          onAdd={() => setPicker("work")}
        />
      ) : null}

      {draft.mode !== null ? (
        <>
          <ScopeSection
            draft={draft}
            error={attempted ? errors.scopeSummary : undefined}
            disabled={isSubmitting}
            onChange={setDraft}
          />
          <MaterialLines
            lines={draft.materialLines}
            errors={attempted ? errors : {}}
            disabled={isSubmitting}
            onChange={(materialLines) =>
              setDraft((current) => ({ ...current, materialLines }))
            }
            onAdd={() => setPicker("material")}
          />
          <OtherCharges
            charges={draft.otherCharges}
            errors={attempted ? errors : {}}
            disabled={isSubmitting}
            onChange={(otherCharges) =>
              setDraft((current) => ({ ...current, otherCharges }))
            }
            onAdd={() =>
              setDraft((current) => ({
                ...current,
                otherCharges: [
                  ...current.otherCharges,
                  {
                    id: id("charge"),
                    code: "TRANSPORT",
                    label: "Transportation",
                    amountPaise: null,
                  },
                ],
              }))
            }
          />
          <Installments
            rows={draft.installments}
            serviceSubtotal={partnerServiceSubtotal(draft)}
            allocated={allocatedInstallmentSubtotal(draft)}
            error={attempted ? errors.installments : undefined}
            disabled={isSubmitting}
            onChange={(installments) =>
              setDraft((current) => ({ ...current, installments }))
            }
            onAdd={() =>
              setDraft((current) => ({
                ...current,
                installments: [...current.installments, newInstallment(id("installment"))],
              }))
            }
          />
          <Terms draft={draft} disabled={isSubmitting} onChange={setDraft} />
        </>
      ) : null}

      <FinancialDock
        draft={draft}
        preview={preview.data}
        previewIsCurrent={previewIsCurrent}
        isChecking={preview.isFetching || (previewBody !== null && !previewIsCurrent)}
        previewError={preview.error}
        blocked={hasCommercialEstimateErrors(errors)}
        isSubmitting={isSubmitting}
        onSend={submit}
        onPreview={() => setPreviewing(true)}
      />

      <EstimatePreviewSheet
        open={previewing}
        onClose={() => setPreviewing(false)}
        draft={draft}
        preview={previewIsCurrent ? preview.data : undefined}
        vendorName={t("proposal.commercialComposer.yourEstimate")}
      />

      <PresetPicker
        open={picker !== null}
        picker={picker}
        mode={draft.mode}
        work={workPresets}
        materials={materialPresets}
        onClose={() => setPicker(null)}
        onCustom={() => {
          if (picker === "material") {
            setDraft((current) => ({
              ...current,
              materialLines: [...current.materialLines, newMaterialLine(id("material"))],
            }));
          } else if (draft.mode === "ITEM_WISE") {
            setDraft((current) => ({
              ...current,
              itemLines: [...current.itemLines, newItemLine(id("item"), "", serviceName)],
            }));
          } else {
            setDraft((current) => ({
              ...current,
              labourLines: [...current.labourLines, newLabourLine(id("labour"))],
            }));
          }
          setPicker(null);
        }}
        onWork={(label) => {
          if (draft.mode === "ITEM_WISE") {
            setDraft((current) => ({
              ...current,
              itemLines: [...current.itemLines, newItemLine(id("item"), label, serviceName)],
            }));
          } else {
            setDraft((current) => ({
              ...current,
              labourLines: [...current.labourLines, newLabourLine(id("labour"), label)],
            }));
          }
          setPicker(null);
        }}
        onMaterial={(label, unit) => {
          setDraft((current) => ({
            ...current,
            materialLines: [
              ...current.materialLines,
              newMaterialLine(id("material"), label, unit),
            ],
          }));
          setPicker(null);
        }}
      />

      <Dialog
        open={pendingMode !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMode(null);
        }}
        title={t("proposal.commercialComposer.changeMethodTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingMode(null)}>
              {t("proposal.commercialComposer.keepMethod")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingMode !== null) applyMode(pendingMode);
              }}
            >
              {t("proposal.commercialComposer.changeAndClear")}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-text-secondary">
          {t("proposal.commercialComposer.changeMethodBody")}
        </p>
      </Dialog>
    </div>
  );
}

function ModeChooser({
  value,
  onChange,
}: {
  value: EstimateMode | null;
  onChange: (mode: EstimateMode) => void;
}) {
  const t = useT();
  return (
    <fieldset className="rounded-card border border-line bg-surface p-4" data-estimate-error>
      <legend className="px-1 text-sm font-extrabold text-text">{t("proposal.commercialComposer.howPricing")}</legend>
      <p className="mt-1 text-sm leading-5 text-text-secondary">
        {t("proposal.commercialComposer.chooseOneMethod")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {([
          ["ITEM_WISE", t("proposal.commercialComposer.mode.itemWise"), t("proposal.commercialComposer.mode.itemWiseHint")],
          ["LABOUR_WISE", t("proposal.commercialComposer.mode.labourWise"), t("proposal.commercialComposer.mode.labourWiseHint")],
        ] as const).map(([mode, label, description]) => {
          const selected = value === mode;
          return (
            <label
              key={mode}
              className={cn(
                "flex min-h-24 cursor-pointer flex-col rounded-card border p-3",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                selected
                  ? "border-2 border-action-secondary bg-selected-surface"
                  : "border-line bg-surface hover:bg-surface-hover",
              )}
            >
              <input
                type="radio"
                name="estimate-mode"
                value={mode}
                checked={selected}
                onChange={() => onChange(mode)}
                className="sr-only"
              />
              <span className="text-sm font-extrabold text-text">{label}</span>
              <span className="mt-1 text-xs leading-4 text-text-muted">{description}</span>
              {selected ? (
                <span className="mt-auto pt-2 text-xs font-bold text-success-text">{t("proposal.commercialComposer.selected")}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  const t = useT();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">
        {title}
      </h2>
      <span className="text-xs font-bold tabular-nums text-text-muted">
        {t("proposal.commercialComposer.lineCount", { count })}
      </span>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-control text-danger-text hover:bg-danger-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

function AddLineButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button block variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={onClick}>
      {children}
    </Button>
  );
}

function ItemLines({
  lines,
  errors,
  disabled,
  onChange,
  onAdd,
}: {
  lines: readonly ItemLineDraft[];
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (lines: readonly ItemLineDraft[]) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const patch = (index: number, next: Partial<ItemLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t("proposal.commercialComposer.itemWiseWork")} count={lines.length} />
      {lines.map((line, index) => (
        <div
          key={line.id}
          data-estimate-error={errors[`item-${index}`] ? true : undefined}
          className={cn(
            "rounded-card border bg-surface p-3",
            errors[`item-${index}`] ? "border-danger-line" : "border-line",
          )}
        >
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-1 min-[360px]:grid-cols-2 gap-2">
              <Field label={t("proposal.commercialComposer.field.category")}>
                <Input value={line.category} onChange={(e) => patch(index, { category: e.target.value })} disabled={disabled} />
              </Field>
              <Field label={t("proposal.commercialComposer.field.itemOrTask")}>
                <Input value={line.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} />
              </Field>
            </div>
            <RemoveButton label={t("proposal.commercialComposer.remove", { name: line.title || t("proposal.commercialComposer.itemN", { n: index + 1 }) })} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-1 min-[360px]:grid-cols-3 gap-2">
            <Field label={t("proposal.commercialComposer.field.unit")}>
              <Select value={line.unit} onChange={(e) => patch(index, { unit: e.target.value as ItemLineDraft["unit"] })} disabled={disabled}>
                {ESTIMATE_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{t(unit.labelKey)}</option>)}
              </Select>
            </Field>
            <Field label={t("proposal.commercialComposer.field.quantity")}>
              <Input inputMode="decimal" value={line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} disabled={disabled} />
            </Field>
            <Field label={t("proposal.commercialComposer.field.rate")}>
              <Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaise)} onChange={(e) => patch(index, { ratePaise: rupeesToPaise(e.target.value) })} disabled={disabled} />
            </Field>
          </div>
          <LineAmount amount={itemLineAmount(line)} />
          {errors[`item-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`item-${index}`]}</p> : null}
        </div>
      ))}
      {errors.lines ? <p role="alert" className="text-sm text-danger-text">{errors.lines}</p> : null}
      <AddLineButton onClick={onAdd}>{t("proposal.commercialComposer.addWork")}</AddLineButton>
    </section>
  );
}

function LabourLines({
  lines,
  errors,
  disabled,
  onChange,
  onAdd,
}: {
  lines: readonly LabourLineDraft[];
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (lines: readonly LabourLineDraft[]) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const patch = (index: number, next: Partial<LabourLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t("proposal.commercialComposer.labourWiseWork")} count={lines.length} />
      {lines.map((line, index) => (
        <div key={line.id} data-estimate-error={errors[`labour-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`labour-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-1 min-[360px]:grid-cols-2 gap-2">
              <Field label={t("proposal.commercialComposer.field.role")}><Input value={line.role} onChange={(e) => patch(index, { role: e.target.value })} disabled={disabled} /></Field>
              <Field label={t("proposal.commercialComposer.field.team")}><Input value={line.team} onChange={(e) => patch(index, { team: e.target.value })} disabled={disabled} /></Field>
            </div>
            <RemoveButton label={t("proposal.commercialComposer.remove", { name: line.role || t("proposal.commercialComposer.roleN", { n: index + 1 }) })} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-1 min-[360px]:grid-cols-3 gap-2">
            <Field label={t("proposal.commercialComposer.field.members")}><Input inputMode="numeric" value={line.memberCount} onChange={(e) => patch(index, { memberCount: Number(e.target.value) })} disabled={disabled} /></Field>
            <Field label={t("proposal.commercialComposer.field.days")}><Input inputMode="numeric" value={line.dayCount} onChange={(e) => patch(index, { dayCount: Number(e.target.value) })} disabled={disabled} /></Field>
            <Field label={t("proposal.commercialComposer.field.ratePerDay")}><Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaisePerDay)} onChange={(e) => patch(index, { ratePaisePerDay: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          <LineAmount amount={labourLineAmount(line)} />
          {errors[`labour-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`labour-${index}`]}</p> : null}
        </div>
      ))}
      {errors.lines ? <p role="alert" className="text-sm text-danger-text">{errors.lines}</p> : null}
      <AddLineButton onClick={onAdd}>{t("proposal.commercialComposer.addLabourRole")}</AddLineButton>
    </section>
  );
}

function MaterialLines({
  lines,
  errors,
  disabled,
  onChange,
  onAdd,
}: {
  lines: readonly MaterialLineDraft[];
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (lines: readonly MaterialLineDraft[]) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const patch = (index: number, next: Partial<MaterialLineDraft>) => onChange(lines.map((line, position) => position === index ? { ...line, ...next } : line));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t("proposal.commercialComposer.materialsAdvance")} count={lines.length} />
      {lines.map((line, index) => (
        <div key={line.id} data-estimate-error={errors[`material-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`material-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><Field label={t("proposal.commercialComposer.field.material")}><Input value={line.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} /></Field></div>
            <RemoveButton label={t("proposal.commercialComposer.remove", { name: line.title || t("proposal.commercialComposer.materialN", { n: index + 1 }) })} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-1 min-[360px]:grid-cols-3 gap-2">
            <Field label={t("proposal.commercialComposer.field.quantity")}><Input inputMode="decimal" value={line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} disabled={disabled} /></Field>
            <Field label={t("proposal.commercialComposer.field.unit")}><Input value={line.unit} onChange={(e) => patch(index, { unit: e.target.value })} disabled={disabled} /></Field>
            <Field label={t("proposal.commercialComposer.field.rate")}><Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaise)} onChange={(e) => patch(index, { ratePaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          <LineAmount amount={materialLineAmount(line)} />
          {errors[`material-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`material-${index}`]}</p> : null}
        </div>
      ))}
      <AddLineButton onClick={onAdd}>{t("proposal.commercialComposer.addMaterial")}</AddLineButton>
    </section>
  );
}

function OtherCharges({
  charges,
  errors,
  disabled,
  onChange,
  onAdd,
}: {
  charges: readonly OtherChargeDraft[];
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (rows: readonly OtherChargeDraft[]) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const patch = (index: number, next: Partial<OtherChargeDraft>) => onChange(charges.map((line, position) => position === index ? { ...line, ...next } : line));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t("proposal.commercialComposer.namedCharges")} count={charges.length} />
      {charges.map((charge, index) => (
        <div key={charge.id} data-estimate-error={errors[`charge-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`charge-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Field label={t("proposal.commercialComposer.field.chargeType")}><Select value={charge.code} onChange={(e) => { const option = CHARGE_OPTIONS.find((row) => row.value === e.target.value); patch(index, { code: e.target.value as OtherChargeDraft["code"], ...(charge.label === "" || CHARGE_OPTIONS.some((row) => row.label === charge.label) ? { label: option?.label ?? "" } : {}) }); }} disabled={disabled}>{CHARGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</Select></Field></div>
            <RemoveButton label={t("proposal.commercialComposer.remove", { name: charge.label || t("proposal.commercialComposer.chargeN", { n: index + 1 }) })} onClick={() => onChange(charges.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_7.5rem] gap-2">
            <Field label={t("proposal.commercialComposer.field.visibleLabel")}><Input value={charge.label} onChange={(e) => patch(index, { label: e.target.value })} disabled={disabled} /></Field>
            <Field label={t("proposal.commercialComposer.field.amount")}><Input inputMode="decimal" value={paiseToRupeeInput(charge.amountPaise)} onChange={(e) => patch(index, { amountPaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          {errors[`charge-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`charge-${index}`]}</p> : null}
        </div>
      ))}
      <AddLineButton onClick={onAdd}>{t("proposal.commercialComposer.addNamedCharge")}</AddLineButton>
    </section>
  );
}

function Installments({
  rows,
  serviceSubtotal,
  allocated,
  error,
  disabled,
  onChange,
  onAdd,
}: {
  rows: readonly InstallmentDraft[];
  serviceSubtotal: number | null;
  allocated: number;
  error?: string;
  disabled: boolean;
  onChange: (rows: readonly InstallmentDraft[]) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const patch = (index: number, next: Partial<InstallmentDraft>) => onChange(rows.map((row, position) => position === index ? { ...row, ...next } : row));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target] as InstallmentDraft, next[index] as InstallmentDraft];
    onChange(next);
  };
  const remaining = serviceSubtotal === null ? null : serviceSubtotal - allocated;
  return (
    <section data-estimate-error={error ? true : undefined} className={cn("rounded-card border bg-surface p-4", error ? "border-danger-line" : "border-line")}>
      <h2 className="text-sm font-extrabold text-text">{t("proposal.commercialComposer.installments.title")}</h2>
      <p className="mt-1 text-sm leading-5 text-text-secondary">{t("proposal.commercialComposer.installments.body")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-control bg-surface-sunken p-3 text-sm">
        <span><span className="block text-xs text-text-muted">{t("proposal.commercialComposer.installments.allocated")}</span><strong className="tabular-nums text-text">{formatMoney(allocated)}</strong></span>
        <span><span className="block text-xs text-text-muted">{t("proposal.commercialComposer.installments.remaining")}</span><strong className={cn("tabular-nums", remaining === 0 ? "text-success-text" : "text-warning-text")}>{remaining === null ? "—" : formatMoney(remaining)}</strong></span>
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="mt-3 rounded-control border border-line p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-text-muted">{t("proposal.commercialComposer.installments.n", { n: index + 1 })}</span><div className="flex"><button type="button" aria-label={t("proposal.commercialComposer.installments.moveUp", { n: index + 1 })} disabled={index === 0 || disabled} onClick={() => move(index, -1)} className="grid size-11 place-items-center disabled:opacity-40"><ChevronUp className="size-4" /></button><button type="button" aria-label={t("proposal.commercialComposer.installments.moveDown", { n: index + 1 })} disabled={index === rows.length - 1 || disabled} onClick={() => move(index, 1)} className="grid size-11 place-items-center disabled:opacity-40"><ChevronDown className="size-4" /></button>{rows.length > 1 ? <RemoveButton label={t("proposal.commercialComposer.installments.remove", { n: index + 1 })} onClick={() => onChange(rows.filter((_, position) => position !== index))} /> : null}</div></div>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2"><Field label={t("proposal.commercialComposer.installments.fieldTitle")}><Input value={row.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} /></Field><Field label={t("proposal.commercialComposer.installments.fieldAmount")}><Input inputMode="decimal" value={paiseToRupeeInput(row.amountPaise)} onChange={(e) => patch(index, { amountPaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field></div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><Field label={t("proposal.commercialComposer.installments.fieldDeliverable")}><Input value={row.deliverable} onChange={(e) => patch(index, { deliverable: e.target.value })} disabled={disabled} /></Field><Field label={t("proposal.commercialComposer.installments.fieldExpectedBy")}><Input type="date" value={row.endsOn ?? ""} onChange={(e) => patch(index, { endsOn: e.target.value || null })} disabled={disabled} /></Field></div>
          {serviceSubtotal !== null && row.amountPaise !== null ? <p className="mt-2 text-xs text-text-muted">{t("proposal.commercialComposer.installments.percentOfService", { percent: Math.round((row.amountPaise / serviceSubtotal) * 100) })}</p> : null}
        </div>
      ))}
      {rows.length === 1 && serviceSubtotal !== null ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => patch(0, { amountPaise: serviceSubtotal, title: rows[0]?.title || "Completion" })}>{t("proposal.commercialComposer.installments.allocateFull")}</Button> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-danger-text">{error}</p> : null}
      <div className="mt-3"><AddLineButton onClick={onAdd}>{t("proposal.commercialComposer.installments.add")}</AddLineButton></div>
    </section>
  );
}

/**
 * What the customer reads first: what you will do, what is in, what is out.
 *
 * The line items say what each rupee buys; this says what the job is. The
 * inclusions are chips rather than a textarea because the customer's
 * comparison table is built from these words — two vendors tapping the same
 * chip produce a row that can say "both include this", and a shorter list
 * shows as a difference rather than vanishing into prose.
 */
function ScopeSection({
  draft,
  error,
  disabled,
  onChange,
}: {
  draft: CommercialEstimateDraft;
  error?: string;
  disabled: boolean;
  onChange: (draft: CommercialEstimateDraft) => void;
}) {
  const t = useT();
  const [customIn, setCustomIn] = useState("");
  const [customOut, setCustomOut] = useState("");
  const toggle = (list: readonly string[], line: string) =>
    list.includes(line) ? list.filter((entry) => entry !== line) : [...list, line];

  return (
    <section
      data-estimate-error={error ? true : undefined}
      className={cn("rounded-card border bg-surface p-4", error ? "border-danger-line" : "border-line")}
    >
      <h2 className="text-sm font-extrabold text-text">{t("proposal.commercialComposer.scope.title")}</h2>
      <p className="mt-1 text-sm leading-5 text-text-secondary">
        {t("proposal.commercialComposer.scope.body")}
      </p>
      <Textarea
        rows={3}
        className="mt-2"
        maxLength={2000}
        placeholder={t("proposal.commercialComposer.scope.placeholder")}
        value={draft.scopeSummary}
        onChange={(e) => onChange({ ...draft, scopeSummary: e.target.value })}
        disabled={disabled}
      />
      {error ? <p role="alert" className="mt-1 text-sm text-danger-text">{error}</p> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-success-text">{t("proposal.commercialComposer.scope.included")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INCLUSION_CHOICES.map((choice) => {
              const on = draft.inclusions.includes(choice.label);
              return (
                <Chip key={choice.code} on={on} disabled={disabled} onClick={() => onChange({ ...draft, inclusions: toggle(draft.inclusions, choice.label) })}>
                  {on ? "✓ " : ""}{presetCaption(t, "inclusion", choice)}
                </Chip>
              );
            })}
            {draft.inclusions.filter((line) => !INCLUSION_CHOICES.some((choice) => choice.label === line)).map((line) => (
              <Chip key={line} on disabled={disabled} onClick={() => onChange({ ...draft, inclusions: draft.inclusions.filter((entry) => entry !== line) })}>
                ✓ {line} ×
              </Chip>
            ))}
          </div>
          <CustomLine value={customIn} onChange={setCustomIn} placeholder={t("proposal.commercialComposer.scope.addIncluded")} disabled={disabled} onAdd={() => { const line = customIn.trim(); if (line) { onChange({ ...draft, inclusions: [...draft.inclusions, line] }); setCustomIn(""); } }} />
        </div>
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">{t("proposal.commercialComposer.scope.notIncluded")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXCLUSION_CHOICES.map((choice) => {
              const on = draft.exclusions.includes(choice.sentence);
              return (
                <Chip key={choice.code} on={on} tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: toggle(draft.exclusions, choice.sentence) })}>
                  {on ? "✗ " : ""}{presetCaption(t, "exclusion", choice)}
                </Chip>
              );
            })}
            {draft.exclusions.filter((line) => line.trim() !== "" && !EXCLUSION_CHOICES.some((choice) => choice.sentence === line)).map((line) => (
              <Chip key={line} on tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: draft.exclusions.filter((entry) => entry !== line) })}>
                ✗ {line} ×
              </Chip>
            ))}
          </div>
          <CustomLine value={customOut} onChange={setCustomOut} placeholder={t("proposal.commercialComposer.scope.addExcluded")} disabled={disabled} onAdd={() => { const line = customOut.trim(); if (line) { onChange({ ...draft, exclusions: [...draft.exclusions.filter((entry) => entry.trim() !== ""), line] }); setCustomOut(""); } }} />
        </div>
      </div>
    </section>
  );
}

function Chip({ on, tone = "success", disabled, onClick, children }: { on: boolean; tone?: "success" | "muted"; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors duration-fast",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60",
        on
          ? tone === "success" ? "border-success-line bg-success-surface text-success-text" : "border-line-strong bg-surface-sunken text-text"
          : "border-line bg-surface text-text-secondary hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function CustomLine({ value, onChange, placeholder, disabled, onAdd }: { value: string; onChange: (value: string) => void; placeholder: string; disabled: boolean; onAdd: () => void }) {
  const t = useT();
  return (
    <div className="mt-2 flex gap-2">
      <Input value={value} placeholder={placeholder} maxLength={200} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || value.trim() === ""} onClick={onAdd}>{t("proposal.commercialComposer.add")}</Button>
    </div>
  );
}

function Terms({ draft, disabled, onChange }: { draft: CommercialEstimateDraft; disabled: boolean; onChange: (draft: CommercialEstimateDraft) => void }) {
  const t = useT();
  return (
    <Disclosure summary={t("proposal.commercialComposer.terms.summary")} hint={t("proposal.commercialComposer.terms.hint")}>
      <div className="flex flex-col gap-3 pt-3">
        <Field label={t("proposal.commercialComposer.terms.warranty")} description={t("proposal.commercialComposer.terms.warrantyHint")}><Textarea rows={2} value={draft.warrantyTerms} onChange={(e) => onChange({ ...draft, warrantyTerms: e.target.value })} disabled={disabled} /></Field>
        <Field label={t("proposal.commercialComposer.terms.validUntil")} description={t("proposal.commercialComposer.terms.validUntilHint")}><Input type="date" value={draft.validUntil?.slice(0, 10) ?? ""} onChange={(e) => onChange({ ...draft, validUntil: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })} disabled={disabled} /></Field>
        <p className="text-xs leading-5 text-text-muted">{t("proposal.commercialComposer.terms.notInvoice")}</p>
      </div>
    </Disclosure>
  );
}

function LineAmount({ amount }: { amount: number | null }) {
  const t = useT();
  return <p className="mt-2 text-right text-sm font-extrabold tabular-nums text-text">{amount === null ? t("proposal.commercialComposer.amountNone") : t("proposal.commercialComposer.amount", { amount: formatMoney(amount) })}</p>;
}

function FinancialDock({ draft, preview, previewIsCurrent, isChecking, previewError, blocked, isSubmitting, onSend, onPreview }: { draft: CommercialEstimateDraft; preview?: import("../queries").ProposalFinancialSummary; previewIsCurrent: boolean; isChecking: boolean; previewError: unknown; blocked: boolean; isSubmitting: boolean; onSend: () => void; onPreview: () => void }) {
  const t = useT();
  const localLines = selectedLineSubtotal(draft);
  const localCharges = authorizedChargeSubtotal(draft);
  const localMaterials = materialSubtotal(draft);
  const localTotal = localLines === null || localCharges === null || localMaterials === null ? null : localLines + localCharges + localMaterials;
  return (
    <aside className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgb(69_63_55/0.08)]">
      {previewIsCurrent && preview ? (
        <Disclosure summary={t("proposal.commercialComposer.dock.serverTotal")} hint={formatMoney(preview.customer_total_paise)}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-xs"><dt className="text-text-muted">{t("proposal.commercialComposer.dock.subtotal")}</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.line_subtotal_paise)}</dd><dt className="text-text-muted">{t("proposal.commercialComposer.dock.charges")}</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.authorized_charges_paise)}</dd><dt className="text-text-muted">{t("proposal.commercialComposer.dock.tax")}</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.partner_service_tax_paise)}</dd><dt className="text-text-muted">{t("proposal.commercialComposer.dock.platform")}</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.platform_fee_paise + preview.platform_fee_tax_paise)}</dd><dt className="font-bold text-text">{t("proposal.commercialComposer.dock.customerTotal")}</dt><dd className="text-right font-bold tabular-nums text-text">{formatMoney(preview.customer_total_paise)}</dd><dt className="font-bold text-success-text">{t("proposal.commercialComposer.dock.youReceive")}</dt><dd className="text-right font-bold tabular-nums text-success-text">{formatMoney(preview.partner_net_paise)}</dd></dl>
        </Disclosure>
      ) : (
        <div className="flex items-baseline justify-between gap-3"><span className="text-xs font-bold uppercase text-text-muted">{t("proposal.commercialComposer.dock.provisional")}</span><strong className="text-2xl tabular-nums text-text">{localTotal === null ? "—" : formatMoney(localTotal)}</strong></div>
      )}
      {isChecking ? <p role="status" className="mt-2 text-xs text-text-muted">{t("proposal.commercialComposer.dock.checking")}</p> : null}
      {previewError ? <ErrorState inline className="mt-2" title={t("proposal.commercialComposer.dock.errorTitle")} message={t("proposal.commercialComposer.dock.errorMessage")} severity="error" /> : null}
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Button size="lg" variant="outline" onClick={onPreview}>{t("proposal.commercialComposer.dock.preview")}</Button>
        <Button block size="lg" disabled={blocked || !previewIsCurrent} loading={isSubmitting} loadingLabel={t("proposal.commercialComposer.dock.sending")} onClick={onSend}>{t("proposal.commercialComposer.dock.send")}</Button>
      </div>
      {!blocked && !previewIsCurrent && !isChecking ? <p className="mt-2 text-center text-xs text-warning-text">{t("proposal.commercialComposer.dock.needsTotal")}</p> : null}
    </aside>
  );
}

function PresetPicker({ open, picker, mode, work, materials, onClose, onCustom, onWork, onMaterial }: { open: boolean; picker: Picker; mode: EstimateMode | null; work: ReturnType<typeof workPresetsFor>; materials: ReturnType<typeof materialPresetsFor>; onClose: () => void; onCustom: () => void; onWork: (label: string) => void; onMaterial: (label: string, unit: string) => void }) {
  const t = useT();
  const isMaterial = picker === "material";
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={isMaterial ? t("proposal.commercialComposer.addMaterial") : mode === "LABOUR_WISE" ? t("proposal.commercialComposer.addLabourRole") : t("proposal.commercialComposer.picker.title")} description={t("proposal.commercialComposer.picker.description")} footer={<Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>}>
      <div className="grid grid-cols-2 gap-2">
        {(isMaterial ? materials : work).map((preset) => (
          <button key={preset.code} type="button" onClick={() => isMaterial ? onMaterial(preset.label, (preset as (typeof materials)[number]).unit) : onWork(preset.label)} className="flex min-h-20 items-center gap-3 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"><span className="grid size-10 place-items-center rounded-control bg-action-surface text-action-active"><Pictogram name={preset.icon} size="sm" /></span><span className="text-sm font-bold text-text">{presetCaption(t, isMaterial ? "material" : "work", preset)}</span></button>
        ))}
      </div>
      <Button block variant="outline" className="mt-3" onClick={onCustom}>{t("proposal.commercialComposer.picker.custom")}</Button>
    </Sheet>
  );
}

export function clearSavedCommercialEstimate(invitationId: string) {
  clearCommercialEstimate(invitationId);
}
