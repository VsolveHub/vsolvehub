// Ported from frontend/apps/partner/features/proposal/view/commercial-estimate-composer.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react-native";
import {
  Button,
  Dialog,
  Disclosure,
  ErrorState,
  Field,
  Input,
  Select,
  Sheet,
  Text,
  Textarea,
  cn,
  formatMoney,
} from "@vsolve/mobile-ui";

import { Pictogram } from "@/features/work-stack/view/pictogram";
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
import { useProposalFinancialPreview, type ProposalFinancialSummary } from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";

export interface CommercialEstimateComposerProps {
  readonly invitationId: string;
  readonly siteVisitId: string;
  readonly serviceName: string;
  readonly archetype: string;
  readonly isSubmitting: boolean;
  readonly onSend: (request: ProposalRequest) => void;
  readonly notice?: ReactNode;
}

type Picker = "work" | "material" | null;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
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
    previewBody === null ? null : { body: previewBody, fingerprint: currentFingerprint },
    450,
  );
  const preview = useProposalFinancialPreview({
    invitationId,
    fingerprint: debouncedPreview?.fingerprint ?? "incomplete",
    body: debouncedPreview?.body ?? null,
  });
  const previewIsCurrent =
    preview.data !== undefined && debouncedPreview !== null && debouncedPreview.fingerprint === currentFingerprint;

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

  function submit() {
    setAttempted(true);
    if (hasCommercialEstimateErrors(errors) || !previewIsCurrent || previewBody === null) return;
    onSend(previewBody);
  }

  return (
    <View className="flex-col gap-4 pb-4">
      {notice}
      <ModeChooser value={draft.mode} onChange={chooseMode} />
      {attempted && errors.mode ? (
        <ErrorState inline title="Choose how you are pricing" message={errors.mode} severity="error" />
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
          <ScopeSection draft={draft} error={attempted ? errors.scopeSummary : undefined} disabled={isSubmitting} onChange={setDraft} />
          <MaterialLines
            lines={draft.materialLines}
            errors={attempted ? errors : {}}
            disabled={isSubmitting}
            onChange={(materialLines) => setDraft((current) => ({ ...current, materialLines }))}
            onAdd={() => setPicker("material")}
          />
          <OtherCharges
            charges={draft.otherCharges}
            errors={attempted ? errors : {}}
            disabled={isSubmitting}
            onChange={(otherCharges) => setDraft((current) => ({ ...current, otherCharges }))}
            onAdd={() =>
              setDraft((current) => ({
                ...current,
                otherCharges: [...current.otherCharges, { id: id("charge"), code: "TRANSPORT", label: "Transportation", amountPaise: null }],
              }))
            }
          />
          <Installments
            rows={draft.installments}
            serviceSubtotal={partnerServiceSubtotal(draft)}
            allocated={allocatedInstallmentSubtotal(draft)}
            error={attempted ? errors.installments : undefined}
            disabled={isSubmitting}
            onChange={(installments) => setDraft((current) => ({ ...current, installments }))}
            onAdd={() => setDraft((current) => ({ ...current, installments: [...current.installments, newInstallment(id("installment"))] }))}
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
            setDraft((current) => ({ ...current, materialLines: [...current.materialLines, newMaterialLine(id("material"))] }));
          } else if (draft.mode === "ITEM_WISE") {
            setDraft((current) => ({ ...current, itemLines: [...current.itemLines, newItemLine(id("item"), "", serviceName)] }));
          } else {
            setDraft((current) => ({ ...current, labourLines: [...current.labourLines, newLabourLine(id("labour"))] }));
          }
          setPicker(null);
        }}
        onWork={(label) => {
          if (draft.mode === "ITEM_WISE") {
            setDraft((current) => ({ ...current, itemLines: [...current.itemLines, newItemLine(id("item"), label, serviceName)] }));
          } else {
            setDraft((current) => ({ ...current, labourLines: [...current.labourLines, newLabourLine(id("labour"), label)] }));
          }
          setPicker(null);
        }}
        onMaterial={(label, unit) => {
          setDraft((current) => ({ ...current, materialLines: [...current.materialLines, newMaterialLine(id("material"), label, unit)] }));
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
            <Button variant="ghost" onPress={() => setPendingMode(null)}>Keep current method</Button>
            <Button variant="danger" onPress={() => { if (pendingMode !== null) applyMode(pendingMode); }}>Change and clear rows</Button>
          </>
        }
      >
        <Text className="text-sm leading-6 text-text-secondary">
          The priced rows in the current method will be cleared. Materials and named charges stay.
        </Text>
      </Dialog>
    </View>
  );
}

function ModeChooser({ value, onChange }: { value: EstimateMode | null; onChange: (mode: EstimateMode) => void }) {
  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <Text className="text-sm font-extrabold text-text">How are you pricing this?</Text>
      <Text className="mt-1 text-sm leading-5 text-text-secondary">Choose one method. The estimate cannot mix both.</Text>
      <View className="mt-3 flex-row gap-2">
        {([
          ["ITEM_WISE", "Item-wise", "Price each task or unit"],
          ["LABOUR_WISE", "Labour-wise", "Price team × days"],
        ] as const).map(([mode, label, description]) => {
          const selected = value === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(mode)}
              className={cn("min-h-24 flex-1 flex-col rounded-card border p-3", selected ? "border-2 border-action-secondary bg-selected-surface" : "border-line bg-surface")}
            >
              <Text className="text-sm font-extrabold text-text">{label}</Text>
              <Text className="mt-1 text-xs leading-4 text-text-muted">{description}</Text>
              {selected ? <Text className="mt-auto pt-2 text-xs font-bold text-success-text">Selected</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">{title}</Text>
      <Text className="text-xs font-bold text-text-muted">{count} {count === 1 ? "line" : "lines"}</Text>
    </View>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onClick} className="h-11 w-11 shrink-0 items-center justify-center rounded-control">
      <Trash2 size={16} color="#9b1c1c" />
    </Pressable>
  );
}

function AddLineButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button block variant="outline" icon={<Plus size={16} color="#00112e" />} onPress={onClick}>
      {children}
    </Button>
  );
}

function ItemLines({ lines, errors, disabled, onChange, onAdd }: { lines: readonly ItemLineDraft[]; errors: Readonly<Record<string, string>>; disabled: boolean; onChange: (lines: readonly ItemLineDraft[]) => void; onAdd: () => void }) {
  const patch = (index: number, next: Partial<ItemLineDraft>) => onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <View className="flex-col gap-2">
      <SectionHeader title="Item-wise work" count={lines.length} />
      {lines.map((line, index) => (
        <View key={line.id} className={cn("rounded-card border bg-surface p-3", errors[`item-${index}`] ? "border-danger-line" : "border-line")}>
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
              <View className="w-[48%]"><Field label="Category"><Input value={line.category} onChangeText={(value) => patch(index, { category: value })} editable={!disabled} /></Field></View>
              <View className="w-[48%]"><Field label="Item or task"><Input value={line.title} onChangeText={(value) => patch(index, { title: value })} editable={!disabled} /></Field></View>
            </View>
            <RemoveButton label={`Remove ${line.title || `item ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </View>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="w-[31%]">
              <Field label="Unit">
                <Select value={line.unit} options={ESTIMATE_UNITS.map((unit) => ({ value: unit.value, label: unit.label }))} onChange={(event) => patch(index, { unit: event.target.value as ItemLineDraft["unit"] })} disabled={disabled} />
              </Field>
            </View>
            <View className="w-[31%]"><Field label="Quantity"><Input keyboardType="decimal-pad" value={line.quantity} onChangeText={(value) => patch(index, { quantity: value })} editable={!disabled} /></Field></View>
            <View className="w-[31%]"><Field label="Rate ₹"><Input keyboardType="decimal-pad" value={paiseToRupeeInput(line.ratePaise)} onChangeText={(value) => patch(index, { ratePaise: rupeesToPaise(value) })} editable={!disabled} /></Field></View>
          </View>
          <LineAmount amount={itemLineAmount(line)} />
          {errors[`item-${index}`] ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger-text">{errors[`item-${index}`]}</Text> : null}
        </View>
      ))}
      {errors.lines ? <Text accessibilityRole="alert" className="text-sm text-danger-text">{errors.lines}</Text> : null}
      <AddLineButton onClick={onAdd}>Add work</AddLineButton>
    </View>
  );
}

function LabourLines({ lines, errors, disabled, onChange, onAdd }: { lines: readonly LabourLineDraft[]; errors: Readonly<Record<string, string>>; disabled: boolean; onChange: (lines: readonly LabourLineDraft[]) => void; onAdd: () => void }) {
  const patch = (index: number, next: Partial<LabourLineDraft>) => onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <View className="flex-col gap-2">
      <SectionHeader title="Labour-wise work" count={lines.length} />
      {lines.map((line, index) => (
        <View key={line.id} className={cn("rounded-card border bg-surface p-3", errors[`labour-${index}`] ? "border-danger-line" : "border-line")}>
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
              <View className="w-[48%]"><Field label="Role or trade"><Input value={line.role} onChangeText={(value) => patch(index, { role: value })} editable={!disabled} /></Field></View>
              <View className="w-[48%]"><Field label="Team (optional)"><Input value={line.team} onChangeText={(value) => patch(index, { team: value })} editable={!disabled} /></Field></View>
            </View>
            <RemoveButton label={`Remove ${line.role || `role ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </View>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="w-[31%]"><Field label="Members"><Input keyboardType="number-pad" value={String(line.memberCount)} onChangeText={(value) => patch(index, { memberCount: Number(value) })} editable={!disabled} /></Field></View>
            <View className="w-[31%]"><Field label="Days"><Input keyboardType="number-pad" value={String(line.dayCount)} onChangeText={(value) => patch(index, { dayCount: Number(value) })} editable={!disabled} /></Field></View>
            <View className="w-[31%]"><Field label="Rate/day ₹"><Input keyboardType="decimal-pad" value={paiseToRupeeInput(line.ratePaisePerDay)} onChangeText={(value) => patch(index, { ratePaisePerDay: rupeesToPaise(value) })} editable={!disabled} /></Field></View>
          </View>
          <LineAmount amount={labourLineAmount(line)} />
          {errors[`labour-${index}`] ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger-text">{errors[`labour-${index}`]}</Text> : null}
        </View>
      ))}
      {errors.lines ? <Text accessibilityRole="alert" className="text-sm text-danger-text">{errors.lines}</Text> : null}
      <AddLineButton onClick={onAdd}>Add labour role</AddLineButton>
    </View>
  );
}

function MaterialLines({ lines, errors, disabled, onChange, onAdd }: { lines: readonly MaterialLineDraft[]; errors: Readonly<Record<string, string>>; disabled: boolean; onChange: (lines: readonly MaterialLineDraft[]) => void; onAdd: () => void }) {
  const patch = (index: number, next: Partial<MaterialLineDraft>) => onChange(lines.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <View className="flex-col gap-2">
      <SectionHeader title="Materials paid as an advance" count={lines.length} />
      {lines.map((line, index) => (
        <View key={line.id} className={cn("rounded-card border bg-surface p-3", errors[`material-${index}`] ? "border-danger-line" : "border-line")}>
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1"><Field label="Material"><Input value={line.title} onChangeText={(value) => patch(index, { title: value })} editable={!disabled} /></Field></View>
            <RemoveButton label={`Remove ${line.title || `material ${index + 1}`}`} onClick={() => onChange(lines.filter((_, position) => position !== index))} />
          </View>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="w-[31%]"><Field label="Quantity"><Input keyboardType="decimal-pad" value={line.quantity} onChangeText={(value) => patch(index, { quantity: value })} editable={!disabled} /></Field></View>
            <View className="w-[31%]"><Field label="Unit"><Input value={line.unit} onChangeText={(value) => patch(index, { unit: value })} editable={!disabled} /></Field></View>
            <View className="w-[31%]"><Field label="Rate ₹"><Input keyboardType="decimal-pad" value={paiseToRupeeInput(line.ratePaise)} onChangeText={(value) => patch(index, { ratePaise: rupeesToPaise(value) })} editable={!disabled} /></Field></View>
          </View>
          <LineAmount amount={materialLineAmount(line)} />
          {errors[`material-${index}`] ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger-text">{errors[`material-${index}`]}</Text> : null}
        </View>
      ))}
      <AddLineButton onClick={onAdd}>Add material</AddLineButton>
    </View>
  );
}

function OtherCharges({ charges, errors, disabled, onChange, onAdd }: { charges: readonly OtherChargeDraft[]; errors: Readonly<Record<string, string>>; disabled: boolean; onChange: (rows: readonly OtherChargeDraft[]) => void; onAdd: () => void }) {
  const patch = (index: number, next: Partial<OtherChargeDraft>) => onChange(charges.map((line, position) => (position === index ? { ...line, ...next } : line)));
  return (
    <View className="flex-col gap-2">
      <SectionHeader title="Named charges" count={charges.length} />
      {charges.map((charge, index) => (
        <View key={charge.id} className={cn("rounded-card border bg-surface p-3", errors[`charge-${index}`] ? "border-danger-line" : "border-line")}>
          <View className="flex-row items-end gap-2">
            <View className="min-w-0 flex-1">
              <Field label="Charge type">
                <Select
                  value={charge.code}
                  options={CHARGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                  disabled={disabled}
                  onChange={(event) => {
                    const option = CHARGE_OPTIONS.find((row) => row.value === event.target.value);
                    patch(index, {
                      code: event.target.value as OtherChargeDraft["code"],
                      ...(charge.label === "" || CHARGE_OPTIONS.some((row) => row.label === charge.label) ? { label: option?.label ?? "" } : {}),
                    });
                  }}
                />
              </Field>
            </View>
            <RemoveButton label={`Remove ${charge.label || `charge ${index + 1}`}`} onClick={() => onChange(charges.filter((_, position) => position !== index))} />
          </View>
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1"><Field label="Visible label"><Input value={charge.label} onChangeText={(value) => patch(index, { label: value })} editable={!disabled} /></Field></View>
            <View className="w-28"><Field label="Amount ₹"><Input keyboardType="decimal-pad" value={paiseToRupeeInput(charge.amountPaise)} onChangeText={(value) => patch(index, { amountPaise: rupeesToPaise(value) })} editable={!disabled} /></Field></View>
          </View>
          {errors[`charge-${index}`] ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger-text">{errors[`charge-${index}`]}</Text> : null}
        </View>
      ))}
      <AddLineButton onClick={onAdd}>Add named charge</AddLineButton>
    </View>
  );
}

function Installments({ rows, serviceSubtotal, allocated, error, disabled, onChange, onAdd }: { rows: readonly InstallmentDraft[]; serviceSubtotal: number | null; allocated: number; error?: string; disabled: boolean; onChange: (rows: readonly InstallmentDraft[]) => void; onAdd: () => void }) {
  const patch = (index: number, next: Partial<InstallmentDraft>) => onChange(rows.map((row, position) => (position === index ? { ...row, ...next } : row)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const current = next[index];
    const swapped = next[target];
    if (current === undefined || swapped === undefined) return;
    next[index] = swapped;
    next[target] = current;
    onChange(next);
  };
  const remaining = serviceSubtotal === null ? null : serviceSubtotal - allocated;
  return (
    <View className={cn("rounded-card border bg-surface p-4", error ? "border-danger-line" : "border-line")}>
      <Text className="text-sm font-extrabold text-text">Payment installments</Text>
      <Text className="mt-1 text-sm leading-5 text-text-secondary">The customer pays these one at a time. Materials are funded separately.</Text>
      <View className="mt-3 flex-row gap-2 rounded-control bg-surface-sunken p-3">
        <View className="flex-1">
          <Text className="text-xs text-text-muted">Allocated</Text>
          <Text className="font-bold text-text">{formatMoney(allocated)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-text-muted">Still to allocate</Text>
          <Text className={remaining === 0 ? "font-bold text-success-text" : "font-bold text-warning-text"}>{remaining === null ? "—" : formatMoney(remaining)}</Text>
        </View>
      </View>
      {rows.map((row, index) => (
        <View key={row.id} className="mt-3 rounded-control border border-line p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-bold uppercase text-text-muted">Installment {index + 1}</Text>
            <View className="flex-row">
              <Pressable accessibilityLabel={`Move installment ${index + 1} up`} disabled={index === 0 || disabled} onPress={() => move(index, -1)} className="h-11 w-11 items-center justify-center disabled:opacity-40"><ChevronUp size={16} color="#00112e" /></Pressable>
              <Pressable accessibilityLabel={`Move installment ${index + 1} down`} disabled={index === rows.length - 1 || disabled} onPress={() => move(index, 1)} className="h-11 w-11 items-center justify-center disabled:opacity-40"><ChevronDown size={16} color="#00112e" /></Pressable>
              {rows.length > 1 ? <RemoveButton label={`Remove installment ${index + 1}`} onClick={() => onChange(rows.filter((_, position) => position !== index))} /> : null}
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Field label="Title"><Input value={row.title} onChangeText={(value) => patch(index, { title: value })} editable={!disabled} /></Field></View>
            <View className="w-28"><Field label="Service amount ₹"><Input keyboardType="decimal-pad" value={paiseToRupeeInput(row.amountPaise)} onChangeText={(value) => patch(index, { amountPaise: rupeesToPaise(value) })} editable={!disabled} /></Field></View>
          </View>
          <View className="mt-2 gap-2">
            <Field label="What the customer receives"><Input value={row.deliverable} onChangeText={(value) => patch(index, { deliverable: value })} editable={!disabled} /></Field>
            <Field label="Expected by (optional)"><Input placeholder="YYYY-MM-DD" value={row.endsOn ?? ""} onChangeText={(value) => patch(index, { endsOn: value || null })} editable={!disabled} /></Field>
          </View>
          {serviceSubtotal !== null && row.amountPaise !== null ? <Text className="mt-2 text-xs text-text-muted">{Math.round((row.amountPaise / serviceSubtotal) * 100)}% of Partner service amount</Text> : null}
        </View>
      ))}
      {rows.length === 1 && serviceSubtotal !== null ? (
        <Button variant="ghost" size="sm" className="mt-2" onPress={() => patch(0, { amountPaise: serviceSubtotal, title: rows[0]?.title || "Completion" })}>Allocate the full service amount</Button>
      ) : null}
      {error ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger-text">{error}</Text> : null}
      <View className="mt-3"><AddLineButton onClick={onAdd}>Add installment</AddLineButton></View>
    </View>
  );
}

function ScopeSection({ draft, error, disabled, onChange }: { draft: CommercialEstimateDraft; error?: string; disabled: boolean; onChange: (draft: CommercialEstimateDraft) => void }) {
  const [customIn, setCustomIn] = useState("");
  const [customOut, setCustomOut] = useState("");
  const toggle = (list: readonly string[], line: string) => (list.includes(line) ? list.filter((entry) => entry !== line) : [...list, line]);
  return (
    <View className={cn("rounded-card border bg-surface p-4", error ? "border-danger-line" : "border-line")}>
      <Text className="text-sm font-extrabold text-text">What you will do</Text>
      <Text className="mt-1 text-sm leading-5 text-text-secondary">The first thing the customer reads. A sentence or two, in your words.</Text>
      <Textarea className="mt-2" maxLength={2000} placeholder="Full strip-out, waterproofing, wall and floor tiling with your tiles, plumbing rerouted for the new shower…" value={draft.scopeSummary} onChangeText={(value) => onChange({ ...draft, scopeSummary: value })} editable={!disabled} />
      {error ? <Text accessibilityRole="alert" className="mt-1 text-sm text-danger-text">{error}</Text> : null}
      <View className="mt-4 gap-4">
        <View>
          <Text className="text-xs font-extrabold uppercase tracking-[0.06em] text-success-text">Included</Text>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {INCLUSION_CHOICES.map((choice) => {
              const on = draft.inclusions.includes(choice.label);
              return <Chip key={choice.code} on={on} disabled={disabled} onClick={() => onChange({ ...draft, inclusions: toggle(draft.inclusions, choice.label) })}>{`${on ? "✓ " : ""}${choice.label}`}</Chip>;
            })}
            {draft.inclusions.filter((line) => !INCLUSION_CHOICES.some((choice) => choice.label === line)).map((line) => (
              <Chip key={line} on disabled={disabled} onClick={() => onChange({ ...draft, inclusions: draft.inclusions.filter((entry) => entry !== line) })}>{`✓ ${line} ×`}</Chip>
            ))}
          </View>
          <CustomLine value={customIn} onChange={setCustomIn} placeholder="Add something else you include" disabled={disabled} onAdd={() => { const line = customIn.trim(); if (line) { onChange({ ...draft, inclusions: [...draft.inclusions, line] }); setCustomIn(""); } }} />
        </View>
        <View>
          <Text className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">Not included</Text>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {EXCLUSION_CHOICES.map((choice) => {
              const on = draft.exclusions.includes(choice.sentence);
              return <Chip key={choice.code} on={on} tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: toggle(draft.exclusions, choice.sentence) })}>{`${on ? "✗ " : ""}${choice.label}`}</Chip>;
            })}
            {draft.exclusions.filter((line) => line.trim() !== "" && !EXCLUSION_CHOICES.some((choice) => choice.sentence === line)).map((line) => (
              <Chip key={line} on tone="muted" disabled={disabled} onClick={() => onChange({ ...draft, exclusions: draft.exclusions.filter((entry) => entry !== line) })}>{`✗ ${line} ×`}</Chip>
            ))}
          </View>
          <CustomLine value={customOut} onChange={setCustomOut} placeholder="Add something you do not include" disabled={disabled} onAdd={() => { const line = customOut.trim(); if (line) { onChange({ ...draft, exclusions: [...draft.exclusions.filter((entry) => entry.trim() !== ""), line] }); setCustomOut(""); } }} />
        </View>
      </View>
    </View>
  );
}

function Chip({ on, tone = "success", disabled, onClick, children }: { on: boolean; tone?: "success" | "muted"; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={onClick} className={cn("min-h-9 items-center justify-center rounded-full border px-3", on ? (tone === "success" ? "border-success-line bg-success-surface" : "border-line-strong bg-surface-sunken") : "border-line bg-surface")}>
      <Text className={cn("text-[13px] font-semibold", on ? (tone === "success" ? "text-success-text" : "text-text") : "text-text-secondary")}>{children}</Text>
    </Pressable>
  );
}

function CustomLine({ value, onChange, placeholder, disabled, onAdd }: { value: string; onChange: (value: string) => void; placeholder: string; disabled: boolean; onAdd: () => void }) {
  return (
    <View className="mt-2 flex-row gap-2">
      <View className="flex-1"><Input value={value} placeholder={placeholder} maxLength={200} editable={!disabled} onChangeText={onChange} onSubmitEditing={onAdd} /></View>
      <Button variant="outline" size="sm" disabled={disabled || value.trim() === ""} onPress={onAdd}>Add</Button>
    </View>
  );
}

function Terms({ draft, disabled, onChange }: { draft: CommercialEstimateDraft; disabled: boolean; onChange: (draft: CommercialEstimateDraft) => void }) {
  return (
    <Disclosure summary="Estimate terms" hint="Warranty and validity">
      <View className="flex-col gap-3 pt-3">
        <Field label="Warranty" description="On workmanship, in your words. A blank here shows as “not stated” beside estimates that have one.">
          <Textarea value={draft.warrantyTerms} onChangeText={(value) => onChange({ ...draft, warrantyTerms: value })} editable={!disabled} />
        </Field>
        <Field label="Estimate valid until" description="The customer sees how many days are left.">
          <Input placeholder="YYYY-MM-DD" value={draft.validUntil?.slice(0, 10) ?? ""} onChangeText={(value) => onChange({ ...draft, validUntil: value ? new Date(`${value}T23:59:59`).toISOString() : null })} editable={!disabled} />
        </Field>
        <Text className="text-xs leading-5 text-text-muted">The PDF is an Estimate/Quotation, not a tax invoice.</Text>
      </View>
    </Disclosure>
  );
}

function LineAmount({ amount }: { amount: number | null }) {
  return <Text className="mt-2 text-right text-sm font-extrabold text-text">{amount === null ? "Amount —" : `Amount ${formatMoney(amount)}`}</Text>;
}

function FinancialDock({ draft, preview, previewIsCurrent, isChecking, previewError, blocked, isSubmitting, onSend, onPreview }: { draft: CommercialEstimateDraft; preview?: ProposalFinancialSummary; previewIsCurrent: boolean; isChecking: boolean; previewError: unknown; blocked: boolean; isSubmitting: boolean; onSend: () => void; onPreview: () => void }) {
  const localLines = selectedLineSubtotal(draft);
  const localCharges = authorizedChargeSubtotal(draft);
  const localMaterials = materialSubtotal(draft);
  const localTotal = localLines === null || localCharges === null || localMaterials === null ? null : localLines + localCharges + localMaterials;
  return (
    <View className="border-t border-line bg-surface pt-3">
      {previewIsCurrent && preview ? (
        <Disclosure summary="Server-checked total" hint={formatMoney(preview.customer_total_paise)}>
          <View className="flex-row flex-wrap gap-y-1 pt-2">
            <Text className="w-1/2 text-xs text-text-muted">Selected-mode subtotal</Text>
            <Text className="w-1/2 text-right text-xs text-text">{formatMoney(preview.line_subtotal_paise)}</Text>
            <Text className="w-1/2 text-xs text-text-muted">Authorized charges</Text>
            <Text className="w-1/2 text-right text-xs text-text">{formatMoney(preview.authorized_charges_paise)}</Text>
            <Text className="w-1/2 text-xs text-text-muted">Tax</Text>
            <Text className="w-1/2 text-right text-xs text-text">{formatMoney(preview.partner_service_tax_paise)}</Text>
            <Text className="w-1/2 text-xs text-text-muted">Platform charge</Text>
            <Text className="w-1/2 text-right text-xs text-text">{formatMoney(preview.platform_fee_paise + preview.platform_fee_tax_paise)}</Text>
            <Text className="w-1/2 text-xs font-bold text-text">Customer total</Text>
            <Text className="w-1/2 text-right text-xs font-bold text-text">{formatMoney(preview.customer_total_paise)}</Text>
            <Text className="w-1/2 text-xs font-bold text-success-text">You receive</Text>
            <Text className="w-1/2 text-right text-xs font-bold text-success-text">{formatMoney(preview.partner_net_paise)}</Text>
          </View>
        </Disclosure>
      ) : (
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-xs font-bold uppercase text-text-muted">Provisional total</Text>
          <Text className="text-2xl font-bold text-text">{localTotal === null ? "—" : formatMoney(localTotal)}</Text>
        </View>
      )}
      {isChecking ? <Text className="mt-2 text-xs text-text-muted">Checking tax, fees and totals with Vsolve…</Text> : null}
      {previewError ? <ErrorState inline className="mt-2" title="We could not check this estimate" message="Your draft is saved. Review the highlighted fields or try the preview again." severity="error" /> : null}
      <View className="mt-3 flex-row gap-2">
        <Button size="lg" variant="outline" onPress={onPreview}>Preview as customer</Button>
        <View className="flex-1"><Button block size="lg" disabled={blocked || !previewIsCurrent} loading={isSubmitting} loadingLabel="Sending estimate" onPress={onSend}>Send estimate</Button></View>
      </View>
      {!blocked && !previewIsCurrent && !isChecking ? <Text className="mt-2 text-center text-xs text-warning-text">A current server total is required before sending.</Text> : null}
    </View>
  );
}

function PresetPicker({ open, picker, mode, work, materials, onClose, onCustom, onWork, onMaterial }: { open: boolean; picker: Picker; mode: EstimateMode | null; work: ReturnType<typeof workPresetsFor>; materials: ReturnType<typeof materialPresetsFor>; onClose: () => void; onCustom: () => void; onWork: (label: string) => void; onMaterial: (label: string, unit: string) => void }) {
  const isMaterial = picker === "material";
  const rows = isMaterial ? materials : work;
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={isMaterial ? "Add material" : mode === "LABOUR_WISE" ? "Add labour role" : "Add from your usual lines"} description="Names and units only. You set every price — your rate card fills these in once it is published." footer={<Button variant="ghost" onPress={onClose}>Cancel</Button>}>
      <View className="flex-row flex-wrap gap-2">
        {rows.map((preset) => (
          <Pressable key={preset.code} onPress={() => (isMaterial ? onMaterial(preset.label, "unit" in preset ? preset.unit : "") : onWork(preset.label))} className="min-h-20 w-[48%] flex-row items-center gap-3 rounded-card border border-line bg-surface p-3">
            <View className="h-10 w-10 items-center justify-center rounded-control bg-action-surface">
              <Pictogram name={preset.icon} size="sm" className="text-action-active" />
            </View>
            <Text className="flex-1 text-sm font-bold text-text">{preset.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button block variant="outline" className="mt-3" onPress={onCustom}>Add a custom line</Button>
    </Sheet>
  );
}

export function clearSavedCommercialEstimate(invitationId: string) {
  clearCommercialEstimate(invitationId);
}
