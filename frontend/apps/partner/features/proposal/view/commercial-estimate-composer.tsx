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

  const errors = useMemo(() => validateCommercialEstimate(draft), [draft]);
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
            title="Choose how you are pricing"
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
        vendorName="Your estimate"
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
        title="Change pricing method?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingMode(null)}>
              Keep current method
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingMode !== null) applyMode(pendingMode);
              }}
            >
              Change and clear rows
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-text-secondary">
          The priced rows in the current method will be cleared. Materials and named charges
          stay.
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
  return (
    <fieldset className="rounded-card border border-line bg-surface p-4" data-estimate-error>
      <legend className="px-1 text-sm font-extrabold text-text">How are you pricing this?</legend>
      <p className="mt-1 text-sm leading-5 text-text-secondary">
        Choose one method. The estimate cannot mix both.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {([
          ["ITEM_WISE", "Item-wise", "Price each task or unit"],
          ["LABOUR_WISE", "Labour-wise", "Price team × days"],
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
                <span className="mt-auto pt-2 text-xs font-bold text-success-text">Selected</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">
        {title}
      </h2>
      <span className="text-xs font-bold tabular-nums text-text-muted">
        {count} {count === 1 ? "line" : "lines"}
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
  const patch = (index: number, next: Partial<ItemLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Item-wise work" count={lines.length} />
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
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <Field label="Category">
                <Input value={line.category} onChange={(e) => patch(index, { category: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Item or task">
                <Input value={line.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} />
              </Field>
            </div>
            <RemoveButton label={`Remove ${line.title || `item ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Unit">
              <Select value={line.unit} onChange={(e) => patch(index, { unit: e.target.value as ItemLineDraft["unit"] })} disabled={disabled}>
                {ESTIMATE_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </Select>
            </Field>
            <Field label="Quantity">
              <Input inputMode="decimal" value={line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} disabled={disabled} />
            </Field>
            <Field label="Rate ₹">
              <Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaise)} onChange={(e) => patch(index, { ratePaise: rupeesToPaise(e.target.value) })} disabled={disabled} />
            </Field>
          </div>
          <LineAmount amount={itemLineAmount(line)} />
          {errors[`item-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`item-${index}`]}</p> : null}
        </div>
      ))}
      {errors.lines ? <p role="alert" className="text-sm text-danger-text">{errors.lines}</p> : null}
      <AddLineButton onClick={onAdd}>Add work</AddLineButton>
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
  const patch = (index: number, next: Partial<LabourLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Labour-wise work" count={lines.length} />
      {lines.map((line, index) => (
        <div key={line.id} data-estimate-error={errors[`labour-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`labour-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <Field label="Role or trade"><Input value={line.role} onChange={(e) => patch(index, { role: e.target.value })} disabled={disabled} /></Field>
              <Field label="Team (optional)"><Input value={line.team} onChange={(e) => patch(index, { team: e.target.value })} disabled={disabled} /></Field>
            </div>
            <RemoveButton label={`Remove ${line.role || `role ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Members"><Input inputMode="numeric" value={line.memberCount} onChange={(e) => patch(index, { memberCount: Number(e.target.value) })} disabled={disabled} /></Field>
            <Field label="Days"><Input inputMode="numeric" value={line.dayCount} onChange={(e) => patch(index, { dayCount: Number(e.target.value) })} disabled={disabled} /></Field>
            <Field label="Rate/day ₹"><Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaisePerDay)} onChange={(e) => patch(index, { ratePaisePerDay: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          <LineAmount amount={labourLineAmount(line)} />
          {errors[`labour-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`labour-${index}`]}</p> : null}
        </div>
      ))}
      {errors.lines ? <p role="alert" className="text-sm text-danger-text">{errors.lines}</p> : null}
      <AddLineButton onClick={onAdd}>Add labour role</AddLineButton>
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
  const patch = (index: number, next: Partial<MaterialLineDraft>) => onChange(lines.map((line, position) => position === index ? { ...line, ...next } : line));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Materials paid as an advance" count={lines.length} />
      {lines.map((line, index) => (
        <div key={line.id} data-estimate-error={errors[`material-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`material-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><Field label="Material"><Input value={line.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} /></Field></div>
            <RemoveButton label={`Remove ${line.title || `material ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Quantity"><Input inputMode="decimal" value={line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} disabled={disabled} /></Field>
            <Field label="Unit"><Input value={line.unit} onChange={(e) => patch(index, { unit: e.target.value })} disabled={disabled} /></Field>
            <Field label="Rate ₹"><Input inputMode="decimal" value={paiseToRupeeInput(line.ratePaise)} onChange={(e) => patch(index, { ratePaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          <LineAmount amount={materialLineAmount(line)} />
          {errors[`material-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`material-${index}`]}</p> : null}
        </div>
      ))}
      <AddLineButton onClick={onAdd}>Add material</AddLineButton>
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
  const patch = (index: number, next: Partial<OtherChargeDraft>) => onChange(charges.map((line, position) => position === index ? { ...line, ...next } : line));
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Named charges" count={charges.length} />
      {charges.map((charge, index) => (
        <div key={charge.id} data-estimate-error={errors[`charge-${index}`] ? true : undefined} className={cn("rounded-card border bg-surface p-3", errors[`charge-${index}`] ? "border-danger-line" : "border-line")}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Field label="Charge type"><Select value={charge.code} onChange={(e) => { const option = CHARGE_OPTIONS.find((row) => row.value === e.target.value); patch(index, { code: e.target.value as OtherChargeDraft["code"], ...(charge.label === "" || CHARGE_OPTIONS.some((row) => row.label === charge.label) ? { label: option?.label ?? "" } : {}) }); }} disabled={disabled}>{CHARGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field></div>
            <RemoveButton label={`Remove ${charge.label || `charge ${index + 1}`}`} onClick={() => onChange(charges.filter((_, position) => position !== index))} />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_7.5rem] gap-2">
            <Field label="Visible label"><Input value={charge.label} onChange={(e) => patch(index, { label: e.target.value })} disabled={disabled} /></Field>
            <Field label="Amount ₹"><Input inputMode="decimal" value={paiseToRupeeInput(charge.amountPaise)} onChange={(e) => patch(index, { amountPaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field>
          </div>
          {errors[`charge-${index}`] ? <p role="alert" className="mt-2 text-sm text-danger-text">{errors[`charge-${index}`]}</p> : null}
        </div>
      ))}
      <AddLineButton onClick={onAdd}>Add named charge</AddLineButton>
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
      <h2 className="text-sm font-extrabold text-text">Payment installments</h2>
      <p className="mt-1 text-sm leading-5 text-text-secondary">The customer pays these one at a time. Materials are funded separately.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-control bg-surface-sunken p-3 text-sm">
        <span><span className="block text-xs text-text-muted">Allocated</span><strong className="tabular-nums text-text">{formatMoney(allocated)}</strong></span>
        <span><span className="block text-xs text-text-muted">Still to allocate</span><strong className={cn("tabular-nums", remaining === 0 ? "text-success-text" : "text-warning-text")}>{remaining === null ? "—" : formatMoney(remaining)}</strong></span>
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="mt-3 rounded-control border border-line p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-text-muted">Installment {index + 1}</span><div className="flex"><button type="button" aria-label={`Move installment ${index + 1} up`} disabled={index === 0 || disabled} onClick={() => move(index, -1)} className="grid size-11 place-items-center disabled:opacity-40"><ChevronUp className="size-4" /></button><button type="button" aria-label={`Move installment ${index + 1} down`} disabled={index === rows.length - 1 || disabled} onClick={() => move(index, 1)} className="grid size-11 place-items-center disabled:opacity-40"><ChevronDown className="size-4" /></button>{rows.length > 1 ? <RemoveButton label={`Remove installment ${index + 1}`} onClick={() => onChange(rows.filter((_, position) => position !== index))} /> : null}</div></div>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2"><Field label="Title"><Input value={row.title} onChange={(e) => patch(index, { title: e.target.value })} disabled={disabled} /></Field><Field label="Service amount ₹"><Input inputMode="decimal" value={paiseToRupeeInput(row.amountPaise)} onChange={(e) => patch(index, { amountPaise: rupeesToPaise(e.target.value) })} disabled={disabled} /></Field></div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><Field label="What the customer receives"><Input value={row.deliverable} onChange={(e) => patch(index, { deliverable: e.target.value })} disabled={disabled} /></Field><Field label="Expected by (optional)"><Input type="date" value={row.endsOn ?? ""} onChange={(e) => patch(index, { endsOn: e.target.value || null })} disabled={disabled} /></Field></div>
          {serviceSubtotal !== null && row.amountPaise !== null ? <p className="mt-2 text-xs text-text-muted">{Math.round((row.amountPaise / serviceSubtotal) * 100)}% of Partner service amount</p> : null}
        </div>
      ))}
      {rows.length === 1 && serviceSubtotal !== null ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => patch(0, { amountPaise: serviceSubtotal, title: rows[0]?.title || "Completion" })}>Allocate the full service amount</Button> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-danger-text">{error}</p> : null}
      <div className="mt-3"><AddLineButton onClick={onAdd}>Add installment</AddLineButton></div>
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
  const [customIn, setCustomIn] = useState("");
  const [customOut, setCustomOut] = useState("");
  const toggle = (list: readonly string[], line: string) =>
    list.includes(line) ? list.filter((entry) => entry !== line) : [...list, line];

  return (
    <section
      data-estimate-error={error ? true : undefined}
      className={cn("rounded-card border bg-surface p-4", error ? "border-danger-line" : "border-line")}
    >
      <h2 className="text-sm font-extrabold text-text">What you will do</h2>
      <p className="mt-1 text-sm leading-5 text-text-secondary">
        The first thing the customer reads. A sentence or two, in your words.
      </p>
      <Textarea
        rows={3}
        className="mt-2"
        maxLength={2000}
        placeholder="Full strip-out, waterproofing, wall and floor tiling with your tiles, plumbing rerouted for the new shower…"
        value={draft.scopeSummary}
        onChange={(e) => onChange({ ...draft, scopeSummary: e.target.value })}
        disabled={disabled}
      />
      {error ? <p role="alert" className="mt-1 text-sm text-danger-text">{error}</p> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-success-text">Included</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INCLUSION_CHOICES.map((choice) => {
              const on = draft.inclusions.includes(choice.label);
              return (
                <Chip key={choice.code} on={on} disabled={disabled} onClick={() => onChange({ ...draft, inclusions: toggle(draft.inclusions, choice.label) })}>
                  {on ? "✓ " : ""}{choice.label}
                </Chip>
              );
            })}
            {draft.inclusions.filter((line) => !INCLUSION_CHOICES.some((choice) => choice.label === line)).map((line) => (
              <Chip key={line} on disabled={disabled} onClick={() => onChange({ ...draft, inclusions: draft.inclusions.filter((entry) => entry !== line) })}>
                ✓ {line} ×
              </Chip>
            ))}
          </div>
          <CustomLine value={customIn} onChange={setCustomIn} placeholder="Add something else you include" disabled={disabled} onAdd={() => { const line = customIn.trim(); if (line) { onChange({ ...draft, inclusions: [...draft.inclusions, line] }); setCustomIn(""); } }} />
        </div>
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">Not included</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXCLUSION_CHOICES.map((choice) => {
              const on = draft.exclusions.includes(choice.sentence);
              return (
                <Chip key={choice.code} on={on} tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: toggle(draft.exclusions, choice.sentence) })}>
                  {on ? "✗ " : ""}{choice.label}
                </Chip>
              );
            })}
            {draft.exclusions.filter((line) => line.trim() !== "" && !EXCLUSION_CHOICES.some((choice) => choice.sentence === line)).map((line) => (
              <Chip key={line} on tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: draft.exclusions.filter((entry) => entry !== line) })}>
                ✗ {line} ×
              </Chip>
            ))}
          </div>
          <CustomLine value={customOut} onChange={setCustomOut} placeholder="Add something you do not include" disabled={disabled} onAdd={() => { const line = customOut.trim(); if (line) { onChange({ ...draft, exclusions: [...draft.exclusions.filter((entry) => entry.trim() !== ""), line] }); setCustomOut(""); } }} />
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
  return (
    <div className="mt-2 flex gap-2">
      <Input value={value} placeholder={placeholder} maxLength={200} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || value.trim() === ""} onClick={onAdd}>Add</Button>
    </div>
  );
}

function Terms({ draft, disabled, onChange }: { draft: CommercialEstimateDraft; disabled: boolean; onChange: (draft: CommercialEstimateDraft) => void }) {
  return (
    <Disclosure summary="Estimate terms" hint="Warranty and validity">
      <div className="flex flex-col gap-3 pt-3">
        <Field label="Warranty" description="On workmanship, in your words. A blank here shows as “not stated” beside estimates that have one."><Textarea rows={2} value={draft.warrantyTerms} onChange={(e) => onChange({ ...draft, warrantyTerms: e.target.value })} disabled={disabled} /></Field>
        <Field label="Estimate valid until" description="The customer sees how many days are left."><Input type="date" value={draft.validUntil?.slice(0, 10) ?? ""} onChange={(e) => onChange({ ...draft, validUntil: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })} disabled={disabled} /></Field>
        <p className="text-xs leading-5 text-text-muted">The PDF is an Estimate/Quotation, not a tax invoice.</p>
      </div>
    </Disclosure>
  );
}

function LineAmount({ amount }: { amount: number | null }) {
  return <p className="mt-2 text-right text-sm font-extrabold tabular-nums text-text">{amount === null ? "Amount —" : `Amount ${formatMoney(amount)}`}</p>;
}

function FinancialDock({ draft, preview, previewIsCurrent, isChecking, previewError, blocked, isSubmitting, onSend, onPreview }: { draft: CommercialEstimateDraft; preview?: import("../queries").ProposalFinancialSummary; previewIsCurrent: boolean; isChecking: boolean; previewError: unknown; blocked: boolean; isSubmitting: boolean; onSend: () => void; onPreview: () => void }) {
  const localLines = selectedLineSubtotal(draft);
  const localCharges = authorizedChargeSubtotal(draft);
  const localMaterials = materialSubtotal(draft);
  const localTotal = localLines === null || localCharges === null || localMaterials === null ? null : localLines + localCharges + localMaterials;
  return (
    <aside className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgb(69_63_55/0.08)]">
      {previewIsCurrent && preview ? (
        <Disclosure summary="Server-checked total" hint={formatMoney(preview.customer_total_paise)}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-xs"><dt className="text-text-muted">Selected-mode subtotal</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.line_subtotal_paise)}</dd><dt className="text-text-muted">Authorized charges</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.authorized_charges_paise)}</dd><dt className="text-text-muted">Tax</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.partner_service_tax_paise)}</dd><dt className="text-text-muted">Platform charge</dt><dd className="text-right tabular-nums text-text">{formatMoney(preview.platform_fee_paise + preview.platform_fee_tax_paise)}</dd><dt className="font-bold text-text">Customer total</dt><dd className="text-right font-bold tabular-nums text-text">{formatMoney(preview.customer_total_paise)}</dd><dt className="font-bold text-success-text">You receive</dt><dd className="text-right font-bold tabular-nums text-success-text">{formatMoney(preview.partner_net_paise)}</dd></dl>
        </Disclosure>
      ) : (
        <div className="flex items-baseline justify-between gap-3"><span className="text-xs font-bold uppercase text-text-muted">Provisional total</span><strong className="text-2xl tabular-nums text-text">{localTotal === null ? "—" : formatMoney(localTotal)}</strong></div>
      )}
      {isChecking ? <p role="status" className="mt-2 text-xs text-text-muted">Checking tax, fees and totals with Vsolve…</p> : null}
      {previewError ? <ErrorState inline className="mt-2" title="We could not check this estimate" message="Your draft is saved. Review the highlighted fields or try the preview again." severity="error" /> : null}
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Button size="lg" variant="outline" onClick={onPreview}>Preview as customer</Button>
        <Button block size="lg" disabled={blocked || !previewIsCurrent} loading={isSubmitting} loadingLabel="Sending estimate" onClick={onSend}>Send estimate</Button>
      </div>
      {!blocked && !previewIsCurrent && !isChecking ? <p className="mt-2 text-center text-xs text-warning-text">A current server total is required before sending.</p> : null}
    </aside>
  );
}

function PresetPicker({ open, picker, mode, work, materials, onClose, onCustom, onWork, onMaterial }: { open: boolean; picker: Picker; mode: EstimateMode | null; work: ReturnType<typeof workPresetsFor>; materials: ReturnType<typeof materialPresetsFor>; onClose: () => void; onCustom: () => void; onWork: (label: string) => void; onMaterial: (label: string, unit: string) => void }) {
  const isMaterial = picker === "material";
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={isMaterial ? "Add material" : mode === "LABOUR_WISE" ? "Add labour role" : "Add from your usual lines"} description="Names and units only. You set every price — your rate card fills these in once it is published." footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <div className="grid grid-cols-2 gap-2">
        {(isMaterial ? materials : work).map((preset) => (
          <button key={preset.code} type="button" onClick={() => isMaterial ? onMaterial(preset.label, (preset as (typeof materials)[number]).unit) : onWork(preset.label)} className="flex min-h-20 items-center gap-3 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"><span className="grid size-10 place-items-center rounded-control bg-action-surface text-action-active"><Pictogram name={preset.icon} size="sm" /></span><span className="text-sm font-bold text-text">{preset.label}</span></button>
        ))}
      </div>
      <Button block variant="outline" className="mt-3" onClick={onCustom}>Add a custom line</Button>
    </Sheet>
  );
}

export function clearSavedCommercialEstimate(invitationId: string) {
  clearCommercialEstimate(invitationId);
}
