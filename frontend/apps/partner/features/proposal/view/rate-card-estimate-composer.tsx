"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import {
  Button,
  Disclosure,
  ErrorState,
  Field,
  Input,
  QuantityStepper,
  Select,
  Sheet,
  Skeleton,
  SkeletonRegion,
  cn,
  formatMoney,
} from "@vsolve/ui";
import {
  Cable,
  Check,
  LayoutGrid,
  Lightbulb,
  Plus,
  ToggleRight,
  Trash2,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { BriefLine } from "@/features/enquiry/model/wire";
import { usePriceBook } from "@/features/price-book/queries";

import {
  CHARGE_OPTIONS,
  EMPTY_COMMERCIAL_ESTIMATE,
  ESTIMATE_UNITS,
  addMaterial,
  activeQuickSet,
  applyQuickSet,
  bundleKeysOf,
  bundleLabel,
  bundleQuantityOf,
  catalogueLabourLine,
  catalogueLineId,
  checkBand,
  commercialEstimateFingerprint,
  composeScopeSummary,
  hasCommercialEstimateErrors,
  isLabourEntry,
  itemLineAmount,
  labourLineAmount,
  loadCommercialEstimate,
  materialKey,
  removeMaterial,
  resolveMaterialList,
  saveCommercialEstimate,
  selectedLineSubtotal,
  setCatalogueQuantity,
  setMaterialQuantity,
  toCommercialPreviewRequest,
  validateCommercialEstimate,
  withAutoText,
  withTemplateInstallments,
  type ChargeCode,
  type CommercialEstimateDraft,
  type EstimateMode,
  type EstimateUnit,
  type ItemLineDraft,
  type LabourLineDraft,
  type MaterialBrandTier,
  type MaterialListLineDraft,
  type PaymentTemplate,
  type PriceBookEntry,
  type ProposalRequest,
} from "../model/commercial-estimate-draft";
import { EXCLUSION_CHOICES, WARRANTY_CHOICES } from "../model/estimate-presets";
import { paiseToRupeeInput, rupeesToPaise } from "../model/proposal-draft";
import {
  isCustomTitleScreened,
  isRateCardUnavailable,
  isRateOutsideBand,
  refusedLineOf,
  useProposalFinancialPreview,
} from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";
import { MoneyPad } from "./money-pad";

/**
 * The on-site estimate in five taps (contract 1.48.0).
 *
 * ## What the vendor does
 *
 * 1. Says how they price: per point, or people × days.
 * 2. Taps the work from their own rate card — a quick set for the flat size,
 *    then `[−] n [+]` per item — or names something the catalogue lacks.
 * 3. Corrects the customer's shopping list, which the server built from the
 *    tapped items' recipes. No prices: materials are the customer's to buy.
 * 4. Taps the terms: what is not included, the guarantee, how long the price
 *    holds, and how the customer pays it.
 * 5. Reads the server-checked total, previews the customer's page, sends.
 *
 * ## What is shared with the detailed composer, and why
 *
 * The draft, its autosave, its validation, the preview hook, the customer
 * preview sheet and the send. This is a different set of controls over the
 * same `CommercialEstimateDraft`, so a vendor who starts here and switches to
 * "Detailed" finds their tapped lines as typed rows, and the body that goes
 * to `POST /proposals/` is the one the server's own preview just priced —
 * `previewIsCurrent` gates Send here exactly as it does there.
 *
 * ## No effect writes state
 *
 * The shopping list is derived: the latest preview's suggestion with the
 * draft's edits applied, on every render, through `resolveMaterialList`.
 * Installments are re-allocated inside the same `update` that changed the
 * amount they split. Neither needs an effect to keep two copies in step,
 * because there is one copy.
 */

export interface RateCardEstimateComposerProps {
  readonly invitationId: string;
  readonly siteVisitId: string;
  readonly serviceName: string;
  readonly brief: readonly BriefLine[];
  /** The enquiry's trade — narrows the rate card to one catalogue. */
  readonly pricingSkillCode: string;
  readonly visitCompleted: boolean;
  readonly isSubmitting: boolean;
  /** The last refusal from Send, for the line-level codes. */
  readonly submitError: unknown;
  readonly onSend: (request: ProposalRequest) => void;
  readonly notice?: React.ReactNode;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<Step, string> = {
  1: "How are you pricing this?",
  2: "Add work",
  3: "What the customer should buy",
  4: "Terms & payment",
  5: "Review & send",
};

type SheetState =
  | { readonly kind: "rate"; readonly entry: PriceBookEntry }
  | { readonly kind: "custom-item" }
  | { readonly kind: "custom-item-rate"; readonly lineId: string }
  | { readonly kind: "custom-labour" }
  | { readonly kind: "labour-rate"; readonly lineId: string }
  | { readonly kind: "material" }
  | { readonly kind: "charge"; readonly code: ChargeCode };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function RateCardEstimateComposer({
  invitationId,
  siteVisitId,
  serviceName,
  brief,
  pricingSkillCode,
  visitCompleted,
  isSubmitting,
  submitError,
  onSend,
  notice,
}: RateCardEstimateComposerProps) {
  const [draft, setDraft] = useState<CommercialEstimateDraft>(() =>
    withTemplateInstallments(loadCommercialEstimate(invitationId) ?? EMPTY_COMMERCIAL_ESTIMATE),
  );
  const [step, setStep] = useState<Step>(() => (draft.mode === null ? 1 : 2));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const idCounter = useRef(0);

  function id(kind: string): string {
    idCounter.current += 1;
    return `${kind}-${Date.now()}-${idCounter.current}`;
  }

  /** Every write goes through here so the template split never drifts from the amount. */
  function update(change: (current: CommercialEstimateDraft) => CommercialEstimateDraft) {
    setDraft((current) => withTemplateInstallments(change(current)));
  }

  useEffect(() => {
    saveCommercialEstimate(invitationId, draft);
  }, [draft, invitationId]);

  const priceBook = usePriceBook(undefined, pricingSkillCode);
  const entries = useMemo(() => priceBook.data?.items ?? [], [priceBook.data]);

  const errors = useMemo(() => validateCommercialEstimate(draft), [draft]);
  const previewBody = useMemo(() => {
    if (hasCommercialEstimateErrors(errors)) return null;
    return toCommercialPreviewRequest({ invitationId, siteVisitId, draft });
  }, [draft, errors, invitationId, siteVisitId]);
  const currentFingerprint =
    previewBody === null ? "incomplete" : commercialEstimateFingerprint(previewBody);
  const debouncedPreview = useDebounced(
    previewBody === null ? null : { body: previewBody, fingerprint: currentFingerprint },
    450,
  );
  const preview = useProposalFinancialPreview({
    invitationId,
    fingerprint: debouncedPreview?.fingerprint ?? "incomplete",
    body: debouncedPreview?.body ?? null,
    keepPrevious: true,
  });
  const previewIsCurrent =
    preview.data !== undefined &&
    !preview.isPlaceholderData &&
    debouncedPreview !== null &&
    debouncedPreview.fingerprint === currentFingerprint;

  const suggested = useMemo<readonly MaterialListLineDraft[]>(
    () =>
      (preview.data?.suggested_material_list ?? []).map((row) => ({
        title: row.title,
        spec: row.spec ?? "",
        unit: row.unit ?? "",
        quantity: row.quantity,
        note: row.note ?? "",
      })),
    [preview.data],
  );
  const materialList = useMemo(() => resolveMaterialList(suggested, draft), [suggested, draft]);

  const lineRefusal = describeLineRefusal(submitError ?? preview.error, draft);
  const rateCardUnavailable = isRateCardUnavailable(preview.error) || isRateCardUnavailable(submitError);

  const linesReady =
    draft.mode !== null &&
    !Object.keys(errors).some((key) => key === "lines" || key.startsWith("item-") || key.startsWith("labour-"));

  function send() {
    if (hasCommercialEstimateErrors(errors) || !previewIsCurrent || previewBody === null) return;
    onSend({
      ...previewBody,
      material_list: materialList
        .filter((row) => row.title.trim() !== "")
        .map((row) => ({
          title: row.title.trim(),
          spec: row.spec.trim(),
          unit: row.unit.trim(),
          quantity: row.quantity,
          note: row.note.trim(),
        })),
    });
  }

  const canContinue =
    step === 1 ? draft.mode !== null : step === 2 ? linesReady : true;

  return (
    <div className="flex flex-col gap-4 pb-24">
      {notice}

      <StepHeader
        step={step}
        serviceName={serviceName}
        brief={brief}
        visitCompleted={visitCompleted}
        onBack={step === 1 ? null : () => setStep((step - 1) as Step)}
      />

      {step === 1 ? (
        <ModeStep value={draft.mode} onChange={(mode) => update((current) => ({ ...current, mode }))} />
      ) : null}

      {step === 2 && draft.mode === "ITEM_WISE" ? (
        <ItemsStep
          draft={draft}
          entries={entries}
          loading={priceBook.isPending}
          loadError={priceBook.isError ? priceBook.error : null}
          onRetry={() => void priceBook.refetch()}
          rateCardUnavailable={rateCardUnavailable}
          lineErrors={lineRefusal}
          onQuickSet={(key) => update((current) => applyQuickSet(current, entries, key))}
          onQuantity={(entry, quantity) =>
            update((current) => ({
              ...current,
              itemLines: setCatalogueQuantity(current.itemLines, entry, quantity),
            }))
          }
          onRate={(entry) => setSheet({ kind: "rate", entry })}
          onCustomQuantity={(lineId, quantity) =>
            update((current) => ({
              ...current,
              itemLines:
                quantity <= 0
                  ? current.itemLines.filter((line) => line.id !== lineId)
                  : current.itemLines.map((line) =>
                      line.id === lineId ? { ...line, quantity: String(quantity) } : line,
                    ),
            }))
          }
          onCustomRate={(lineId) => setSheet({ kind: "custom-item-rate", lineId })}
          onAddCustom={() => setSheet({ kind: "custom-item" })}
        />
      ) : null}

      {step === 2 && draft.mode === "LABOUR_WISE" ? (
        <LabourStep
          draft={draft}
          entries={entries}
          loading={priceBook.isPending}
          loadError={priceBook.isError ? priceBook.error : null}
          onRetry={() => void priceBook.refetch()}
          rateCardUnavailable={rateCardUnavailable}
          onToggle={(entry) =>
            update((current) => {
              const lineId = catalogueLineId(entry.work_item.id);
              const present = current.labourLines.some((line) => line.id === lineId);
              return {
                ...current,
                labourLines: present
                  ? current.labourLines.filter((line) => line.id !== lineId)
                  : [...current.labourLines, catalogueLabourLine(entry)],
              };
            })
          }
          onChange={(lineId, patch) =>
            update((current) => ({
              ...current,
              labourLines: current.labourLines.map((line) =>
                line.id === lineId ? { ...line, ...patch } : line,
              ),
            }))
          }
          onRemove={(lineId) =>
            update((current) => ({
              ...current,
              labourLines: current.labourLines.filter((line) => line.id !== lineId),
            }))
          }
          onRate={(lineId) => setSheet({ kind: "labour-rate", lineId })}
          onAddRole={() => setSheet({ kind: "custom-labour" })}
        />
      ) : null}

      {step === 3 ? (
        <MaterialsStep
          rows={materialList}
          waiting={preview.data === undefined && previewBody !== null}
          tier={draft.materialBrandTier}
          labourWise={draft.mode === "LABOUR_WISE"}
          onTier={(materialBrandTier) => update((current) => ({ ...current, materialBrandTier }))}
          onQuantity={(row, quantity) => update((current) => setMaterialQuantity(current, row, quantity))}
          onRemove={(row) => update((current) => removeMaterial(current, row))}
          onAdd={() => setSheet({ kind: "material" })}
        />
      ) : null}

      {step === 4 ? (
        <TermsStep
          draft={draft}
          onChange={update}
          onCharge={(code) => setSheet({ kind: "charge", code })}
          newId={id}
        />
      ) : null}

      {step === 5 ? (
        <ReviewStep
          draft={draft}
          preview={previewIsCurrent ? preview.data : undefined}
          isChecking={preview.isFetching || (previewBody !== null && !previewIsCurrent)}
          previewError={preview.error}
          blocked={hasCommercialEstimateErrors(errors)}
          errors={errors}
          lineErrors={lineRefusal}
          materialCount={materialList.length}
          onFix={(target) => setStep(target)}
        />
      ) : null}

      <StepDock
        step={step}
        canContinue={canContinue}
        draft={draft}
        previewIsCurrent={previewIsCurrent}
        blocked={hasCommercialEstimateErrors(errors)}
        isSubmitting={isSubmitting}
        onContinue={() => setStep((step + 1) as Step)}
        onPreview={() => setPreviewing(true)}
        onSend={send}
      />

      <EstimatePreviewSheet
        open={previewing}
        onClose={() => setPreviewing(false)}
        draft={withAutoText(draft)}
        preview={previewIsCurrent ? preview.data : undefined}
        vendorName="Your estimate"
        materialList={materialList}
      />

      {sheet?.kind === "rate" ? (
        <RateSheet
          title={sheet.entry.work_item.name}
          unit={sheet.entry.work_item.unit}
          floorPaise={sheet.entry.floor_paise}
          ceilingPaise={sheet.entry.ceiling_paise}
          amountPaise={
            draft.itemLines.find((line) => line.id === catalogueLineId(sheet.entry.work_item.id))
              ?.ratePaise ?? sheet.entry.partner_rate_paise ?? sheet.entry.reference_rate_paise
          }
          onDone={(ratePaise) => {
            const entry = sheet.entry;
            update((current) => {
              const lineId = catalogueLineId(entry.work_item.id);
              const present = current.itemLines.some((line) => line.id === lineId);
              const lines = present ? current.itemLines : setCatalogueQuantity(current.itemLines, entry, 1);
              return {
                ...current,
                itemLines: lines.map((line) => (line.id === lineId ? { ...line, ratePaise } : line)),
              };
            });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === "custom-item-rate" ? (
        <RateSheet
          title={draft.itemLines.find((line) => line.id === sheet.lineId)?.title ?? "Custom item"}
          unit={draft.itemLines.find((line) => line.id === sheet.lineId)?.unit ?? "each"}
          floorPaise={null}
          ceilingPaise={null}
          amountPaise={draft.itemLines.find((line) => line.id === sheet.lineId)?.ratePaise ?? null}
          onDone={(ratePaise) => {
            update((current) => ({
              ...current,
              itemLines: current.itemLines.map((line) =>
                line.id === sheet.lineId ? { ...line, ratePaise } : line,
              ),
            }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === "labour-rate" ? (
        <RateSheet
          title={draft.labourLines.find((line) => line.id === sheet.lineId)?.role ?? "Role"}
          unit="day"
          floorPaise={draft.labourLines.find((line) => line.id === sheet.lineId)?.floorPaise ?? null}
          ceilingPaise={draft.labourLines.find((line) => line.id === sheet.lineId)?.ceilingPaise ?? null}
          amountPaise={draft.labourLines.find((line) => line.id === sheet.lineId)?.ratePaisePerDay ?? null}
          onDone={(ratePaisePerDay) => {
            update((current) => ({
              ...current,
              labourLines: current.labourLines.map((line) =>
                line.id === sheet.lineId ? { ...line, ratePaisePerDay } : line,
              ),
            }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === "custom-item" ? (
        <CustomItemSheet
          onAdd={(line) => {
            update((current) => ({ ...current, itemLines: [...current.itemLines, line] }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
          newId={() => id("custom")}
        />
      ) : null}

      {sheet?.kind === "custom-labour" ? (
        <CustomLabourSheet
          onAdd={(line) => {
            update((current) => ({ ...current, labourLines: [...current.labourLines, line] }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
          newId={() => id("role")}
        />
      ) : null}

      {sheet?.kind === "material" ? (
        <MaterialSheet
          onAdd={(row) => {
            update((current) => addMaterial(current, row));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === "charge" ? (
        <RateSheet
          title={CHARGE_OPTIONS.find((option) => option.value === sheet.code)?.label ?? "Charge"}
          unit=""
          floorPaise={null}
          ceilingPaise={null}
          amountPaise={draft.otherCharges.find((charge) => charge.code === sheet.code)?.amountPaise ?? null}
          allowZero
          onDone={(amountPaise) => {
            const code = sheet.code;
            update((current) => {
              const others = current.otherCharges.filter((charge) => charge.code !== code);
              if (amountPaise === null) return { ...current, otherCharges: others };
              const label = CHARGE_OPTIONS.find((option) => option.value === code)?.label ?? code;
              return {
                ...current,
                otherCharges: [...others, { id: id("charge"), code, label, amountPaise }],
              };
            });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Server refusals, beside the line they name
   -------------------------------------------------------------------------- */

export interface LineRefusal {
  readonly message: string;
  /** Item line ids the message belongs beside. */
  readonly itemLineIds: readonly string[];
  readonly kind: "rate" | "title";
}

/**
 * Which rows a `rate_outside_band` / `custom_title_screened` refusal is about.
 *
 * The envelope's `details` is read first; failing that, the client's own band
 * check picks the catalogue rows that would fail, or every custom row for a
 * screened title. Never nothing: a refusal with no row to sit beside still
 * has to be read, so the last fallback is every line of the relevant kind.
 */
export function describeLineRefusal(
  error: unknown,
  draft: CommercialEstimateDraft,
): LineRefusal | null {
  if (!(error instanceof ApiRequestError)) return null;
  const pointer = refusedLineOf(error);
  if (isRateOutsideBand(error)) {
    const byPointer = draft.itemLines.filter(
      (line, index) =>
        (pointer.workItemId !== null && line.workItemId === pointer.workItemId) ||
        (pointer.index !== null && index === pointer.index),
    );
    const byBand = draft.itemLines.filter((line) => {
      const check = checkBand(line, line.ratePaise);
      return check === "below" || check === "above";
    });
    const rows = byPointer.length > 0 ? byPointer : byBand.length > 0 ? byBand : draft.itemLines.filter((line) => !line.isCustom);
    return { message: error.message, kind: "rate", itemLineIds: rows.map((line) => line.id) };
  }
  if (isCustomTitleScreened(error)) {
    const byPointer = draft.itemLines.filter(
      (line, index) =>
        (pointer.title !== null && line.title.trim() === pointer.title.trim()) ||
        (pointer.index !== null && index === pointer.index),
    );
    const rows = byPointer.length > 0 ? byPointer : draft.itemLines.filter((line) => line.isCustom);
    return { message: error.message, kind: "title", itemLineIds: rows.map((line) => line.id) };
  }
  return null;
}

/* --------------------------------------------------------------------------
   Header and dock
   -------------------------------------------------------------------------- */

function StepHeader({
  step,
  serviceName,
  brief,
  visitCompleted,
  onBack,
}: {
  step: Step;
  serviceName: string;
  brief: readonly BriefLine[];
  visitCompleted: boolean;
  onBack: (() => void) | null;
}) {
  const context = [
    ...brief.filter((line) => line.value.trim() !== "").map((line) => line.value.trim()),
    ...(visitCompleted ? ["visit done ✓"] : []),
  ].join(" · ");
  return (
    <header className="flex flex-col gap-2">
      <ol aria-label="Estimate steps" className="flex items-center gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((index) => (
          <li
            key={index}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              index < step ? "bg-success-text" : index === step ? "bg-action" : "bg-surface-sunken",
            )}
          >
            <span className="sr-only">
              Step {index}: {STEP_TITLES[index]}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-[-0.01em] text-text">{STEP_TITLES[step]}</h2>
          <p className="truncate text-xs text-text-secondary">
            {serviceName}
            {context ? ` · ${context}` : ""}
          </p>
        </div>
      </div>
    </header>
  );
}

function StepDock({
  step,
  canContinue,
  draft,
  previewIsCurrent,
  blocked,
  isSubmitting,
  onContinue,
  onPreview,
  onSend,
}: {
  step: Step;
  canContinue: boolean;
  draft: CommercialEstimateDraft;
  previewIsCurrent: boolean;
  blocked: boolean;
  isSubmitting: boolean;
  onContinue: () => void;
  onPreview: () => void;
  onSend: () => void;
}) {
  const lineCount = draft.mode === "LABOUR_WISE" ? draft.labourLines.length : draft.itemLines.length;
  const labour = selectedLineSubtotal(draft);
  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(69_63_55/0.08)]">
      <div className="mx-auto max-w-xl">
        {step === 5 ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button size="lg" variant="outline" onClick={onPreview}>
              Preview as customer
            </Button>
            <Button
              block
              size="lg"
              disabled={blocked || !previewIsCurrent}
              loading={isSubmitting}
              loadingLabel="Sending estimate"
              onClick={onSend}
            >
              Send estimate
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {step === 2 || step === 3 || step === 4 ? (
              <span className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-text-secondary">
                {lineCount} {lineCount === 1 ? "item" : "items"} · Labour {labour === null ? "—" : formatMoney(labour)}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <Button size="lg" disabled={!canContinue} onClick={onContinue}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* --------------------------------------------------------------------------
   Step 1 — mode
   -------------------------------------------------------------------------- */

function ModeStep({
  value,
  onChange,
}: {
  value: EstimateMode | null;
  onChange: (mode: EstimateMode) => void;
}) {
  return (
    <div role="radiogroup" aria-label="How are you pricing this?" className="grid grid-cols-2 gap-3">
      {(
        [
          ["ITEM_WISE", "Item-wise", "per point / per unit", Zap],
          ["LABOUR_WISE", "Labour-wise", "electrician + helper × days", Users],
        ] as const
      ).map(([mode, label, detail, Icon]) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode)}
            className={cn(
              "flex min-h-32 flex-col items-center justify-center gap-2 rounded-card border p-3 text-center",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              selected ? "border-2 border-action bg-action-surface" : "border-line bg-surface hover:bg-surface-hover",
            )}
          >
            <Icon className={cn("size-8", selected ? "text-action-active" : "text-action-secondary")} aria-hidden />
            <span className="text-base font-extrabold text-text">{label}</span>
            <span className="text-xs leading-4 text-text-muted">{detail}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Step 2 — item-wise
   -------------------------------------------------------------------------- */

const GROUP_ICONS: Record<string, LucideIcon> = {
  points: Zap,
  boards: LayoutGrid,
  "mcb / db": ToggleRight,
  conduit: Cable,
  fixtures: Lightbulb,
  labour: Users,
};

function iconForGroup(group: string | undefined): LucideIcon {
  return GROUP_ICONS[(group ?? "").trim().toLowerCase()] ?? Wrench;
}

const UNIT_SHORT: Record<string, string> = {
  each: "nos",
  job: "job",
  day: "day",
  hour: "hr",
  sq_ft: "sq ft",
  running_ft: "rft",
  metre: "m",
  kg: "kg",
  litre: "L",
  set: "set",
};

function unitShort(unit: string): string {
  return UNIT_SHORT[unit] ?? unit;
}

function ItemsStep({
  draft,
  entries,
  loading,
  loadError,
  onRetry,
  rateCardUnavailable,
  lineErrors,
  onQuickSet,
  onQuantity,
  onRate,
  onCustomQuantity,
  onCustomRate,
  onAddCustom,
}: {
  draft: CommercialEstimateDraft;
  entries: readonly PriceBookEntry[];
  loading: boolean;
  loadError: unknown;
  onRetry: () => void;
  rateCardUnavailable: boolean;
  lineErrors: LineRefusal | null;
  onQuickSet: (key: string) => void;
  onQuantity: (entry: PriceBookEntry, quantity: number) => void;
  onRate: (entry: PriceBookEntry) => void;
  onCustomQuantity: (lineId: string, quantity: number) => void;
  onCustomRate: (lineId: string) => void;
  onAddCustom: () => void;
}) {
  const items = useMemo(() => entries.filter((entry) => !isLabourEntry(entry)), [entries]);
  const groups = useMemo(() => {
    const names: string[] = [];
    for (const entry of items) {
      const name = entry.work_item.group?.trim() || "Other";
      if (!names.includes(name)) names.push(name);
    }
    return names;
  }, [items]);
  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab !== null && groups.includes(tab) ? tab : (groups[0] ?? null);
  const bundles = useMemo(() => bundleKeysOf(items), [items]);
  const activeBundle = useMemo(() => activeQuickSet(draft, items), [draft, items]);
  const custom = draft.itemLines.filter((line) => line.isCustom);

  if (loading) {
    return (
      <SkeletonRegion loading label="Loading your rate card">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </SkeletonRegion>
    );
  }

  if (loadError) {
    const presentation = describeError(loadError, "read");
    return (
      <ErrorState
        title="Your rate card did not load"
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetry}
        reference={presentation.reference}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rateCardUnavailable ? (
        <ErrorState
          inline
          severity="warning"
          title="Rates for your city are not published yet"
          message="Vsolve cannot check catalogue rates here today. Name the work as custom items to send this estimate."
        />
      ) : null}

      {bundles.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick sets">
          {bundles.map((key) => {
            const selected = activeBundle === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => onQuickSet(key)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  // The set on the estimate right now reads as chosen; the
                  // others stay quiet. Words too (`aria-pressed`), not colour alone.
                  selected
                    ? "border-2 border-action-secondary bg-action-secondary text-action-secondary-text"
                    : "border border-info-line bg-info-surface text-info-text hover:bg-surface-hover",
                )}
              >
                {selected ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <LayoutGrid className="size-4" aria-hidden />
                )}
                {bundleLabel(key)}
              </button>
            );
          })}
        </div>
      ) : null}

      {groups.length > 1 ? (
        <div role="tablist" aria-label="Work groups" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {groups.map((name) => {
            const on = name === activeTab;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(name)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-bold",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  on ? "border-action-secondary bg-selected-surface text-text" : "border-line bg-surface text-text-secondary",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm leading-6 text-text-secondary">
          No catalogue items for your trade yet. Add what you found as custom items below.
        </p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {items
          .filter((entry) => (entry.work_item.group?.trim() || "Other") === activeTab)
          .map((entry) => {
            const line = draft.itemLines.find((row) => row.id === catalogueLineId(entry.work_item.id));
            const rate = line?.ratePaise ?? entry.partner_rate_paise ?? entry.reference_rate_paise;
            const quantity = line === undefined ? 0 : Number(line.quantity) || 0;
            const refusal = line !== undefined && lineErrors?.itemLineIds.includes(line.id) ? lineErrors : null;
            const Icon = iconForGroup(entry.work_item.group);
            const band = line === undefined ? "ok" : checkBand(line, line.ratePaise);
            return (
              <li key={entry.work_item.id}>
                <ItemRow
                  icon={Icon}
                  name={entry.work_item.name}
                  rateLabel={rate === null ? "Set rate" : `${formatMoney(rate)}/${unitShort(entry.work_item.unit)}`}
                  rateWarning={band === "below" || band === "above" ? "Outside the allowed range" : null}
                  quantity={quantity}
                  selected={quantity > 0}
                  amount={line === undefined ? null : itemLineAmount(line)}
                  bundleHint={
                    bundles.length > 0
                      ? bundles
                          .map((key) => {
                            const value = bundleQuantityOf(entry, key);
                            return value === null ? null : `${bundleLabel(key)} ${value}`;
                          })
                          .filter(Boolean)
                          .join(" · ")
                      : ""
                  }
                  error={refusal?.message ?? null}
                  onQuantity={(next) => onQuantity(entry, next)}
                  onRate={() => onRate(entry)}
                />
              </li>
            );
          })}
      </ul>

      {custom.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">Not in the catalogue</h3>
          <ul className="flex list-none flex-col gap-2 p-0">
            {custom.map((line) => {
              const refusal = lineErrors?.itemLineIds.includes(line.id) ? lineErrors : null;
              return (
                <li key={line.id}>
                  <ItemRow
                    icon={Wrench}
                    name={line.title}
                    chip="Custom"
                    rateLabel={line.ratePaise === null ? "Set rate" : `${formatMoney(line.ratePaise)}/${unitShort(line.unit)}`}
                    rateWarning={null}
                    quantity={Number(line.quantity) || 0}
                    selected
                    amount={itemLineAmount(line)}
                    bundleHint=""
                    error={refusal?.message ?? null}
                    onQuantity={(next) => onCustomQuantity(line.id, next)}
                    onRate={() => onCustomRate(line.id)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <AddRow label="Something not listed" onClick={onAddCustom} />
    </div>
  );
}

function ItemRow({
  icon: Icon,
  name,
  chip,
  rateLabel,
  rateWarning,
  quantity,
  selected,
  amount,
  bundleHint,
  error,
  onQuantity,
  onRate,
}: {
  icon: LucideIcon;
  name: string;
  chip?: string;
  rateLabel: string;
  rateWarning: string | null;
  quantity: number;
  selected: boolean;
  amount: number | null;
  bundleHint: string;
  error: string | null;
  onQuantity: (quantity: number) => void;
  onRate: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-card bg-surface p-3",
        error ? "border-2 border-danger-line" : selected ? "border-2 border-action" : "border border-line",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-control",
            selected ? "bg-action-surface text-action-active" : "bg-surface-sunken text-text-muted",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-text">{name}</span>
            {chip ? (
              <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                {chip}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onRate}
            className={cn(
              "w-fit text-left text-sm font-semibold tabular-nums underline-offset-2 hover:underline",
              rateWarning ? "text-danger-text" : "text-action-secondary",
            )}
          >
            {rateLabel}
            <span className="sr-only"> — change the rate for {name}</span>
          </button>
        </span>
        <div role="group" aria-label={`How many ${name}`} className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`One fewer ${name}`}
            disabled={quantity <= 0}
            onClick={() => onQuantity(quantity - 1)}
            className="grid h-11 w-11 place-items-center rounded-control border border-line-strong bg-surface text-lg text-text disabled:border-line disabled:text-warm-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span aria-hidden>−</span>
          </button>
          <output aria-live="polite" className="min-w-8 text-center text-base font-bold tabular-nums text-text">
            {quantity}
          </output>
          <button
            type="button"
            aria-label={`One more ${name}`}
            onClick={() => onQuantity(quantity + 1)}
            className="grid h-11 w-11 place-items-center rounded-control border border-line-strong bg-surface text-lg text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span aria-hidden>+</span>
          </button>
        </div>
      </div>
      {bundleHint || amount !== null ? (
        <div className="flex items-baseline justify-between gap-2 text-xs text-text-muted">
          <span className="truncate">{bundleHint}</span>
          {amount !== null ? <span className="shrink-0 font-bold tabular-nums text-text">{formatMoney(amount)}</span> : null}
        </div>
      ) : null}
      {rateWarning && !error ? <p className="text-xs text-danger-text">{rateWarning}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-13 items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong text-base font-bold text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Plus className="size-5" aria-hidden />
      {label}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Step 2 — labour-wise
   -------------------------------------------------------------------------- */

function LabourStep({
  draft,
  entries,
  loading,
  loadError,
  onRetry,
  rateCardUnavailable,
  onToggle,
  onChange,
  onRemove,
  onRate,
  onAddRole,
}: {
  draft: CommercialEstimateDraft;
  entries: readonly PriceBookEntry[];
  loading: boolean;
  loadError: unknown;
  onRetry: () => void;
  rateCardUnavailable: boolean;
  onToggle: (entry: PriceBookEntry) => void;
  onChange: (lineId: string, patch: Partial<LabourLineDraft>) => void;
  onRemove: (lineId: string) => void;
  onRate: (lineId: string) => void;
  onAddRole: () => void;
}) {
  const roles = useMemo(() => entries.filter(isLabourEntry), [entries]);
  const custom = draft.labourLines.filter((line) => !line.workItemId);

  if (loading) {
    return (
      <SkeletonRegion loading label="Loading your rate card">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </SkeletonRegion>
    );
  }
  if (loadError) {
    const presentation = describeError(loadError, "read");
    return (
      <ErrorState
        title="Your rate card did not load"
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetry}
        reference={presentation.reference}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rateCardUnavailable ? (
        <ErrorState
          inline
          severity="warning"
          title="Rates for your city are not published yet"
          message="Vsolve cannot check day rates here today. Add the roles you need and set each rate yourself."
        />
      ) : null}
      {roles.length === 0 && custom.length === 0 ? (
        <p className="text-sm leading-6 text-text-secondary">No labour roles in your rate card yet. Add a role below.</p>
      ) : null}
      <ul className="flex list-none flex-col gap-2 p-0">
        {roles.map((entry) => {
          const line = draft.labourLines.find((row) => row.id === catalogueLineId(entry.work_item.id));
          return (
            <li key={entry.work_item.id}>
              <LabourRow
                name={entry.work_item.name}
                line={line ?? null}
                rateLabel={
                  (line?.ratePaisePerDay ?? entry.partner_rate_paise ?? entry.reference_rate_paise) === null
                    ? "Set rate"
                    : `${formatMoney((line?.ratePaisePerDay ?? entry.partner_rate_paise ?? entry.reference_rate_paise) as number)}/day`
                }
                onToggle={() => onToggle(entry)}
                onChange={(patch) => line && onChange(line.id, patch)}
                onRate={() => {
                  if (line === undefined) onToggle(entry);
                  onRate(catalogueLineId(entry.work_item.id));
                }}
              />
            </li>
          );
        })}
        {custom.map((line) => (
          <li key={line.id}>
            <LabourRow
              name={line.role}
              chip="Custom"
              line={line}
              rateLabel={line.ratePaisePerDay === null ? "Set rate" : `${formatMoney(line.ratePaisePerDay)}/day`}
              onToggle={() => onRemove(line.id)}
              onChange={(patch) => onChange(line.id, patch)}
              onRate={() => onRate(line.id)}
            />
          </li>
        ))}
      </ul>
      <AddRow label="Add a role" onClick={onAddRole} />
    </div>
  );
}

function LabourRow({
  name,
  chip,
  line,
  rateLabel,
  onToggle,
  onChange,
  onRate,
}: {
  name: string;
  chip?: string;
  line: LabourLineDraft | null;
  rateLabel: string;
  onToggle: () => void;
  onChange: (patch: Partial<LabourLineDraft>) => void;
  onRate: () => void;
}) {
  const selected = line !== null;
  const amount = line === null ? null : labourLineAmount(line);
  const band = line === null ? "ok" : checkBand(line, line.ratePaisePerDay);
  return (
    <div className={cn("flex flex-col gap-2 rounded-card bg-surface p-3", selected ? "border-2 border-action" : "border border-line")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={selected}
          onClick={onToggle}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            selected ? "bg-action-surface text-action-active" : "bg-surface-sunken text-text-muted",
          )}
        >
          {selected ? <Check className="size-5" aria-hidden /> : <Users className="size-5" aria-hidden />}
          <span className="sr-only">{selected ? `Remove ${name}` : `Add ${name}`}</span>
        </button>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-text">{name}</span>
            {chip ? (
              <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                {chip}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onRate}
            className={cn(
              "w-fit text-left text-sm font-semibold tabular-nums underline-offset-2 hover:underline",
              band === "below" || band === "above" ? "text-danger-text" : "text-action-secondary",
            )}
          >
            {rateLabel}
            <span className="sr-only"> — change the day rate for {name}</span>
          </button>
        </span>
        {amount !== null ? <span className="shrink-0 text-base font-extrabold tabular-nums text-text">{formatMoney(amount)}</span> : null}
      </div>
      {line !== null ? (
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <QuantityStepper
            label="People"
            value={line.memberCount}
            onChange={(memberCount) => onChange({ memberCount })}
            min={1}
            decrementLabel={`One fewer ${name}`}
            incrementLabel={`One more ${name}`}
          />
          <QuantityStepper
            label="Days"
            value={line.dayCount}
            onChange={(dayCount) => onChange({ dayCount })}
            min={1}
            decrementLabel={`One day fewer for ${name}`}
            incrementLabel={`One more day for ${name}`}
          />
        </div>
      ) : null}
      {band === "below" || band === "above" ? <p className="text-xs text-danger-text">Outside the allowed range</p> : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Step 3 — the shopping list
   -------------------------------------------------------------------------- */

function MaterialsStep({
  rows,
  waiting,
  tier,
  labourWise,
  onTier,
  onQuantity,
  onRemove,
  onAdd,
}: {
  rows: readonly MaterialListLineDraft[];
  waiting: boolean;
  tier: MaterialBrandTier;
  labourWise: boolean;
  onTier: (tier: MaterialBrandTier) => void;
  onQuantity: (row: MaterialListLineDraft, quantity: string) => void;
  onRemove: (row: MaterialListLineDraft) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-text-secondary">
        {labourWise
          ? "List what the customer should buy before you start."
          : "Auto-built from your points. Fix any quantity — you saw the site."}
      </p>

      <div role="radiogroup" aria-label="Brand tier" className="grid grid-cols-2 gap-2">
        {(
          [
            ["STANDARD", "Standard"],
            ["PREMIUM", "Premium"],
          ] as const
        ).map(([value, label]) => {
          const on = tier === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onTier(on ? "" : value)}
              className={cn(
                "min-h-12 rounded-card border text-sm font-bold",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                on ? "border-2 border-action bg-action-surface text-action-active" : "border-line bg-surface text-text-secondary",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {waiting && rows.length === 0 ? (
        <SkeletonRegion loading label="Working out what to buy">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </SkeletonRegion>
      ) : null}

      {!waiting && rows.length === 0 ? (
        <p className="text-sm leading-6 text-text-muted">Nothing to buy yet.</p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={materialKey(row)} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold text-text">{row.title}</span>
              {row.spec ? <span className="truncate text-xs text-text-muted">{row.spec}</span> : null}
            </span>
            <DecimalStepper
              name={row.title}
              value={row.quantity}
              unit={row.unit}
              onChange={(quantity) => onQuantity(row, quantity)}
            />
            <button
              type="button"
              aria-label={`Remove ${row.title}`}
              onClick={() => onRemove(row)}
              className="grid size-11 shrink-0 place-items-center rounded-control text-danger-text hover:bg-danger-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <AddRow label="Add a material" onClick={onAdd} />
    </div>
  );
}

/** ± 1 on a decimal string, floored at one. The unit sits beside the number. */
function DecimalStepper({
  name,
  value,
  unit,
  onChange,
}: {
  name: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
}) {
  const current = Number(value);
  const numeric = Number.isFinite(current) ? current : 1;
  const step = (delta: number) => onChange(String(Math.max(1, Math.round((numeric + delta) * 1000) / 1000)));
  return (
    <div role="group" aria-label={`How many ${name}`} className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`One fewer ${name}`}
        disabled={numeric <= 1}
        onClick={() => step(-1)}
        className="grid h-11 w-11 place-items-center rounded-control border border-line-strong bg-surface text-lg text-text disabled:border-line disabled:text-warm-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden>−</span>
      </button>
      <output aria-live="polite" className="flex min-w-12 flex-col items-center text-center leading-tight">
        <span className="text-base font-bold tabular-nums text-text">{value}</span>
        {unit ? <span className="text-[10px] font-semibold text-text-muted">{unit}</span> : null}
      </output>
      <button
        type="button"
        aria-label={`One more ${name}`}
        onClick={() => step(1)}
        className="grid h-11 w-11 place-items-center rounded-control border border-line-strong bg-surface text-lg text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Step 4 — terms
   -------------------------------------------------------------------------- */

const VALIDITY_DAYS = [7, 15, 30] as const;

function validUntilFor(days: number): string {
  const end = new Date();
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 0);
  return end.toISOString();
}

function validityDaysOf(validUntil: string | null): number | null {
  if (validUntil === null) return null;
  const ms = new Date(validUntil).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  const days = Math.round(ms / 86_400_000);
  return VALIDITY_DAYS.find((option) => Math.abs(option - days) <= 1) ?? null;
}

const TEMPLATES: readonly { value: PaymentTemplate; label: string }[] = [
  { value: "HALF", label: "50% start · 50% finish" },
  { value: "THIRDS", label: "3 parts" },
  { value: "COMPLETION", label: "On completion" },
];

const CHARGE_CHIPS: readonly { code: ChargeCode; label: string }[] = [
  { code: "TRANSPORT", label: "Transport" },
  { code: "DISPOSAL", label: "Debris" },
];

function TermsStep({
  draft,
  onChange,
  onCharge,
  newId,
}: {
  draft: CommercialEstimateDraft;
  onChange: (change: (current: CommercialEstimateDraft) => CommercialEstimateDraft) => void;
  onCharge: (code: ChargeCode) => void;
  newId: (kind: string) => string;
}) {
  const validity = validityDaysOf(draft.validUntil);
  const composed = composeScopeSummary(draft);

  return (
    <div className="flex flex-col gap-5">
      <TermGroup title="Not included">
        <div className="flex flex-wrap gap-2">
          {EXCLUSION_CHOICES.map((choice) => {
            const on = draft.exclusions.includes(choice.sentence);
            return (
              <Chip
                key={choice.code}
                on={on}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    exclusions: on
                      ? current.exclusions.filter((line) => line !== choice.sentence)
                      : [...current.exclusions, choice.sentence],
                  }))
                }
              >
                {choice.label}
              </Chip>
            );
          })}
        </div>
      </TermGroup>

      <TermGroup title="Guarantee">
        <div role="radiogroup" aria-label="Guarantee" className="grid grid-cols-4 gap-2">
          {WARRANTY_CHOICES.map((choice) => {
            const on = draft.warrantyTerms === choice.terms;
            return (
              <Tile key={choice.code} on={on} onClick={() => onChange((current) => ({ ...current, warrantyTerms: choice.terms }))}>
                {choice.label}
              </Tile>
            );
          })}
        </div>
      </TermGroup>

      <TermGroup title="Valid for">
        <div role="radiogroup" aria-label="Valid for" className="grid grid-cols-3 gap-2">
          {VALIDITY_DAYS.map((days) => (
            <Tile
              key={days}
              on={validity === days}
              onClick={() => onChange((current) => ({ ...current, validUntil: validUntilFor(days) }))}
            >
              {days} days
            </Tile>
          ))}
        </div>
      </TermGroup>

      <TermGroup title="Payment">
        <div role="radiogroup" aria-label="Payment" className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
          {TEMPLATES.map((template) => (
            <Tile
              key={template.value}
              on={draft.paymentTemplate === template.value}
              onClick={() => onChange((current) => ({ ...current, paymentTemplate: template.value }))}
            >
              {template.label}
            </Tile>
          ))}
        </div>
        <ul className="mt-2 list-none divide-y divide-line rounded-card border border-line bg-surface p-0 text-sm">
          {draft.installments.map((row, index) => (
            <li key={row.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="text-text">
                {index + 1}. {row.title || `Part ${index + 1}`}
              </span>
              <span className="font-bold tabular-nums text-text">
                {row.amountPaise === null ? "—" : formatMoney(row.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
        {draft.paymentTemplate === "CUSTOM" ? (
          <CustomInstallments draft={draft} onChange={onChange} newId={newId} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-fit"
            onClick={() => onChange((current) => ({ ...current, paymentTemplate: "CUSTOM" }))}
          >
            Customise
          </Button>
        )}
      </TermGroup>

      <TermGroup title="Extra charges">
        <div className="flex flex-wrap gap-2">
          {CHARGE_CHIPS.map((chip) => {
            const charge = draft.otherCharges.find((row) => row.code === chip.code);
            return (
              <Chip key={chip.code} on={charge !== undefined} onClick={() => onCharge(chip.code)}>
                {chip.label}
                {charge?.amountPaise ? ` · ${formatMoney(charge.amountPaise)}` : ""}
              </Chip>
            );
          })}
        </div>
      </TermGroup>

      <Disclosure summary="What you will do" hint={draft.scopeSummary.trim() === "" ? "Auto" : "Edited"}>
        <div className="pt-2">
          <Input
            value={draft.scopeSummary}
            maxLength={2000}
            placeholder={composed || "Composed from what you tapped"}
            aria-label="What you will do"
            onChange={(event) => onChange((current) => ({ ...current, scopeSummary: event.target.value }))}
          />
        </div>
      </Disclosure>
    </div>
  );
}

function CustomInstallments({
  draft,
  onChange,
  newId,
}: {
  draft: CommercialEstimateDraft;
  onChange: (change: (current: CommercialEstimateDraft) => CommercialEstimateDraft) => void;
  newId: (kind: string) => string;
}) {
  const patch = (index: number, next: Partial<CommercialEstimateDraft["installments"][number]>) =>
    onChange((current) => ({
      ...current,
      installments: current.installments.map((row, position) => (position === index ? { ...row, ...next } : row)),
    }));
  return (
    <div className="mt-2 flex flex-col gap-2">
      {draft.installments.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
          <Field label={`Part ${index + 1}`}>
            <Input value={row.title} onChange={(event) => patch(index, { title: event.target.value })} />
          </Field>
          <Field label="₹">
            <Input
              inputMode="decimal"
              value={paiseToRupeeInput(row.amountPaise)}
              onChange={(event) => patch(index, { amountPaise: rupeesToPaise(event.target.value) })}
            />
          </Field>
          <button
            type="button"
            aria-label={`Remove part ${index + 1}`}
            disabled={draft.installments.length <= 1}
            onClick={() =>
              onChange((current) => ({
                ...current,
                installments: current.installments.filter((_, position) => position !== index),
              }))
            }
            className="grid size-11 place-items-center rounded-control text-danger-text disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() =>
          onChange((current) => ({
            ...current,
            installments: [
              ...current.installments,
              { id: newId("installment"), title: "", deliverable: "", amountPaise: null, endsOn: null },
            ],
          }))
        }
      >
        Add a part
      </Button>
    </div>
  );
}

function TermGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        on ? "border-line-strong bg-surface-sunken text-text" : "border-line bg-surface text-text-secondary",
      )}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

function Tile({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-card border px-2 text-center text-sm font-bold leading-tight",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        on ? "border-2 border-action bg-action-surface text-action-active" : "border-line bg-surface text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Step 5 — review
   -------------------------------------------------------------------------- */

function ReviewStep({
  draft,
  preview,
  isChecking,
  previewError,
  blocked,
  errors,
  lineErrors,
  materialCount,
  onFix,
}: {
  draft: CommercialEstimateDraft;
  preview: Schemas["ProposalFinancialSummary"] | undefined;
  isChecking: boolean;
  previewError: unknown;
  blocked: boolean;
  errors: Readonly<Record<string, string>>;
  lineErrors: LineRefusal | null;
  materialCount: number;
  onFix: (step: Step) => void;
}) {
  const lines =
    draft.mode === "LABOUR_WISE"
      ? draft.labourLines.map((line) => ({
          id: line.id,
          title: line.role,
          detail: `${line.memberCount} × ${line.dayCount} ${line.dayCount === 1 ? "day" : "days"}`,
          amount: labourLineAmount(line),
          error: null as string | null,
        }))
      : draft.itemLines.map((line) => ({
          id: line.id,
          title: line.title,
          detail: `${line.quantity} × ${line.ratePaise === null ? "—" : formatMoney(line.ratePaise)}`,
          amount: itemLineAmount(line),
          error: lineErrors?.itemLineIds.includes(line.id) ? lineErrors.message : null,
        }));
  const firstError = Object.values(errors)[0];

  return (
    <div className="flex flex-col gap-4">
      <ul className="list-none divide-y divide-line rounded-card border border-line bg-surface p-0 text-sm">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-1 px-3 py-2">
            <div className="flex justify-between gap-3">
              <span>
                <span className="font-semibold text-text">{line.title}</span>
                <span className="block text-xs text-text-muted">{line.detail}</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums text-text">{line.amount === null ? "—" : formatMoney(line.amount)}</span>
            </div>
            {line.error ? (
              <p role="alert" className="text-xs font-semibold text-danger-text">
                {line.error}
              </p>
            ) : null}
          </li>
        ))}
        {draft.otherCharges.map((charge) => (
          <li key={charge.id} className="flex justify-between gap-3 px-3 py-2">
            <span className="text-text">{charge.label}</span>
            <span className="font-bold tabular-nums text-text">{charge.amountPaise === null ? "—" : formatMoney(charge.amountPaise)}</span>
          </li>
        ))}
      </ul>

      {lineErrors ? (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => onFix(2)}>
          Fix on the work step
        </Button>
      ) : null}

      {preview ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-card border border-line bg-surface p-3 text-sm">
          <dt className="text-text-muted">{draft.mode === "LABOUR_WISE" ? "Labour subtotal" : "Item subtotal"}</dt>
          <dd className="text-right tabular-nums text-text">{formatMoney(preview.line_subtotal_paise)}</dd>
          <dt className="text-text-muted">Charges</dt>
          <dd className="text-right tabular-nums text-text">{formatMoney(preview.authorized_charges_paise)}</dd>
          <dt className="text-text-muted">Tax</dt>
          <dd className="text-right tabular-nums text-text">{formatMoney(preview.partner_service_tax_paise)}</dd>
          <dt className="font-bold text-text">Customer total</dt>
          <dd className="text-right font-bold tabular-nums text-text">{formatMoney(preview.customer_total_paise)}</dd>
          <dt className="font-bold text-success-text">You receive</dt>
          <dd className="text-right font-bold tabular-nums text-success-text">{formatMoney(preview.partner_net_paise)}</dd>
        </dl>
      ) : isChecking ? (
        <p role="status" className="text-sm text-text-muted">
          Checking tax, fees and totals with Vsolve…
        </p>
      ) : blocked && firstError ? (
        <ErrorState inline severity="warning" title="Not ready to send" message={firstError} />
      ) : null}

      {previewError && !lineErrors ? (
        <ErrorState
          inline
          title="We could not check this estimate"
          message={describeError(previewError, "read").message}
          severity="error"
        />
      ) : null}

      <p className="text-sm text-text-secondary">
        Materials: {materialCount} {materialCount === 1 ? "item" : "items"} · customer buys
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sheets
   -------------------------------------------------------------------------- */

/** The keypad, with the band printed and an out-of-band amount refused at Done. */
function RateSheet({
  title,
  unit,
  floorPaise,
  ceilingPaise,
  amountPaise,
  allowZero = false,
  onDone,
  onClose,
}: {
  title: string;
  unit: string;
  floorPaise: number | null;
  ceilingPaise: number | null;
  amountPaise: number | null;
  /** A zero commits as `null` — used to clear a charge rather than refuse it. */
  allowZero?: boolean;
  onDone: (amountPaise: number | null) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(amountPaise);
  const [tried, setTried] = useState(false);
  const banded = floorPaise !== null && ceilingPaise !== null;
  const outside = banded && amount !== null && (amount < floorPaise || amount > ceilingPaise);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={unit ? `${title} · per ${unitShort(unit)}` : title}
    >
      <MoneyPad
        title={title}
        icon="price"
        amountPaise={amount}
        onChange={setAmount}
        onDone={() => {
          setTried(true);
          if (outside) return;
          if (amount === null && !allowZero) return;
          onDone(amount);
        }}
      >
        {banded ? (
          <p className={cn("text-center text-xs font-semibold", outside ? "text-danger-text" : "text-text-secondary")}>
            Allowed {formatMoney(floorPaise)} – {formatMoney(ceilingPaise)}
          </p>
        ) : null}
        {tried && outside ? (
          <p role="alert" className="text-center text-xs font-semibold text-danger-text">
            Keep the rate inside the range to continue.
          </p>
        ) : null}
      </MoneyPad>
    </Sheet>
  );
}

function CustomItemSheet({
  onAdd,
  onClose,
  newId,
}: {
  onAdd: (line: ItemLineDraft) => void;
  onClose: () => void;
  newId: () => string;
}) {
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState<EstimateUnit>("each");
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const ready = title.trim() !== "" && rate !== null;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Something not listed"
    >
      <MoneyPad
        title={title.trim() === "" ? "Custom item" : title.trim()}
        icon="price"
        amountPaise={rate}
        onChange={setRate}
        onDone={() => {
          setTried(true);
          if (!ready) return;
          onAdd({
            id: newId(),
            category: "",
            title: title.trim(),
            unit,
            quantity: String(quantity),
            ratePaise: rate,
            workItemId: null,
            isCustom: true,
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Field label="What is it" error={tried && title.trim() === "" ? "Name the item." : undefined}>
            <Input className="h-9 text-sm" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Unit">
            <Select className="h-9 text-sm" value={unit} onChange={(event) => setUnit(event.target.value as EstimateUnit)}>
              {ESTIMATE_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-control border border-line/60 bg-surface-sunken/40 px-3 py-2">
            <QuantityStepper
              label="How many"
              value={quantity}
              onChange={setQuantity}
              min={1}
              decrementLabel="One fewer"
              incrementLabel="One more"
            />
          </div>
          <p className="text-[11px] text-text-muted">Rate per {unitShort(unit)}, below.</p>
        </div>
      </MoneyPad>
    </Sheet>
  );
}

function CustomLabourSheet({
  onAdd,
  onClose,
  newId,
}: {
  onAdd: (line: LabourLineDraft) => void;
  onClose: () => void;
  newId: () => string;
}) {
  const [role, setRole] = useState("");
  const [people, setPeople] = useState(1);
  const [days, setDays] = useState(1);
  const [rate, setRate] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const ready = role.trim() !== "" && rate !== null;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a role"
    >
      <MoneyPad
        title={role.trim() === "" ? "Rate per day" : `${role.trim()} · per day`}
        icon="crew"
        amountPaise={rate}
        onChange={setRate}
        onDone={() => {
          setTried(true);
          if (!ready) return;
          onAdd({
            id: newId(),
            role: role.trim(),
            team: "",
            memberCount: people,
            dayCount: days,
            ratePaisePerDay: rate,
            workItemId: null,
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <Field label="Role" error={tried && role.trim() === "" ? "Name the role." : undefined}>
            <Input className="h-8 text-xs" value={role} maxLength={80} placeholder="e.g. Electrician, Helper" onChange={(event) => setRole(event.target.value)} />
          </Field>
          <div className="flex flex-col gap-1 rounded-control border border-line/60 bg-surface-sunken/40 px-2.5 py-1">
            <QuantityStepper label="People" value={people} onChange={setPeople} min={1} decrementLabel="One fewer person" incrementLabel="One more person" />
            <div className="border-t border-line/40" />
            <QuantityStepper label="Days" value={days} onChange={setDays} min={1} decrementLabel="One day fewer" incrementLabel="One more day" />
          </div>
        </div>
      </MoneyPad>
    </Sheet>
  );
}

function MaterialSheet({
  onAdd,
  onClose,
}: {
  onAdd: (row: MaterialListLineDraft) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a material"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true);
              if (title.trim() === "") return;
              onAdd({ title: title.trim(), spec: "", unit: unit.trim(), quantity: String(quantity), note: "" });
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Material" error={tried && title.trim() === "" ? "Name the material." : undefined}>
          <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Unit" description="Coils, boxes, bags — as the shop sells it.">
          <Input value={unit} maxLength={32} onChange={(event) => setUnit(event.target.value)} />
        </Field>
        <QuantityStepper label="How many" value={quantity} onChange={setQuantity} min={1} decrementLabel="One fewer" incrementLabel="One more" />
      </div>
    </Sheet>
  );
}
