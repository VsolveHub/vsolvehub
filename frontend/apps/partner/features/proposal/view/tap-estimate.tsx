"use client";

import { Button, QuantityStepper, cn, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import {
  EXCLUSION_CHOICES,
  WARRANTY_CHOICES,
  materialPresetsFor,
  workPresetsFor,
  type MaterialPreset,
  type WorkPreset,
} from "../model/estimate-presets";
import {
  EMPTY_TAP_ESTIMATE,
  setMaterialAmount,
  setMaterialQuantity,
  setWorkAmount,
  setWorkDays,
  tapBlockedReason,
  tapSubtotal,
  tapTotal,
  toggleExclusion,
  toggleMaterial,
  toggleWork,
  type TapEstimate,
} from "../model/tap-estimate";
import type { TaxBasis } from "../model/proposal-draft";
import { MoneyPad } from "./money-pad";

/**
 * The estimate, built entirely by tapping.
 *
 * ## The rule this screen is made of
 *
 * **The picture carries the meaning and the word is the caption** — the reverse
 * of the composer it replaces, where the word was all there was. A vendor who
 * cannot read English can still recognise a paint roller, count days on a
 * stepper, and read `₹15,000`. Digits and the rupee sign are the one piece of
 * text almost everybody in this market reads, so the running total is the
 * largest thing on every screen.
 *
 * ## No text field, anywhere
 *
 * Not "fewer" and not "shorter". The typed composer had twelve fields and seven
 * of them needed a keyboard; this has none. Work names, deliverables, material
 * descriptions, units, warranty wording and exclusions all come from
 * `estimate-presets`, and every number comes from a keypad or a stepper.
 *
 * ## Why the steps are three and not four
 *
 * Pricing is not a step. A vendor taps the work, and each tapped row opens the
 * keypad in place — so the price is entered where the work is, in the same
 * gesture, rather than on a screen that lists everything again. Only the two
 * things that are genuinely separate questions get their own step.
 */

export interface TapEstimateProps {
  /** Decides which preset list is offered. See `workPresetsFor`. */
  readonly archetype: string;
  /** The customer's own start date, carried through and never asked for. */
  readonly startsOn: string | null;
  /**
   * The tax basis the requirement demands, when it demands one.
   *
   * `required_tax_basis` is a server fact about this requirement. When it is set
   * the question is not the vendor's to answer, so the step is skipped rather
   * than shown as a choice with one option.
   */
  readonly requiredTaxBasis: TaxBasis | null;
  readonly isSubmitting: boolean;
  readonly onSend: (estimate: TapEstimate) => void;
  /** Rendered above the controls. The visit guard, or a server refusal. */
  readonly notice?: React.ReactNode;
}

type Step = "work" | "extras" | "check";

export function TapEstimate({
  archetype,
  startsOn,
  requiredTaxBasis,
  isSubmitting,
  onSend,
  notice,
}: TapEstimateProps) {
  const [estimate, setEstimate] = useState<TapEstimate>({
    ...EMPTY_TAP_ESTIMATE,
    startsOn,
    taxBasis: requiredTaxBasis,
  });
  const [step, setStep] = useState<Step>("work");
  /** Which row has the keypad open, as `work:code` or `material:code`. */
  const [pricing, setPricing] = useState<string | null>(null);

  const work = workPresetsFor(archetype);
  const materials = materialPresetsFor(archetype);
  const blocked = tapBlockedReason(estimate);

  if (pricing !== null) {
    return (
      <PricingSheet
        pricing={pricing}
        estimate={estimate}
        work={work}
        materials={materials}
        onChange={setEstimate}
        onDone={() => setPricing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {notice}

      <RunningTotal estimate={estimate} />

      {step === "work" ? (
        <WorkStep
          estimate={estimate}
          work={work}
          materials={materials}
          onChange={setEstimate}
          onPrice={setPricing}
          onNext={() => setStep("extras")}
        />
      ) : step === "extras" ? (
        <ExtrasStep
          estimate={estimate}
          askTax={requiredTaxBasis === null}
          onChange={setEstimate}
          onBack={() => setStep("work")}
          onNext={() => setStep("check")}
        />
      ) : (
        <CheckStep
          estimate={estimate}
          work={work}
          materials={materials}
          blocked={blocked}
          isSubmitting={isSubmitting}
          onBack={() => setStep("extras")}
          onSend={() => onSend(estimate)}
        />
      )}
    </div>
  );
}

/**
 * The price so far, on every screen.
 *
 * Says "not priced yet" rather than `₹0` while anything tapped is unpriced.
 * A zero is a number a vendor might send; the absence of one is the truth.
 */
function RunningTotal({ estimate }: { estimate: TapEstimate }) {
  const total = tapTotal(estimate);

  return (
    <p className="flex items-baseline justify-between gap-3 rounded-card bg-action-secondary px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wider text-action-secondary-text opacity-80">
        Your price
      </span>
      <span
        aria-live="polite"
        className="text-2xl font-bold tabular-nums text-action-secondary-text"
      >
        {total === null ? "—" : formatMoney(total)}
      </span>
    </p>
  );
}

function WorkStep({
  estimate,
  work,
  materials,
  onChange,
  onPrice,
  onNext,
}: {
  estimate: TapEstimate;
  work: readonly WorkPreset[];
  materials: readonly MaterialPreset[];
  onChange: (next: TapEstimate) => void;
  onPrice: (key: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Tap what you will do</SectionLabel>
      <TileGrid>
        {work.map((preset) => (
          <Tile
            key={preset.code}
            glyph={preset.glyph}
            label={preset.label}
            selected={estimate.work.includes(preset.code)}
            onToggle={() => onChange(toggleWork(estimate, preset.code))}
          />
        ))}
      </TileGrid>

      <SectionLabel>Materials you will buy</SectionLabel>
      <TileGrid>
        {materials.map((preset) => (
          <Tile
            key={preset.code}
            glyph={preset.glyph}
            label={preset.label}
            selected={estimate.materials.includes(preset.code)}
            onToggle={() => onChange(toggleMaterial(estimate, preset.code))}
          />
        ))}
      </TileGrid>

      {estimate.work.length > 0 || estimate.materials.length > 0 ? (
        <>
          <SectionLabel>Put a price on each one</SectionLabel>
          <ul className="flex list-none flex-col gap-2 p-0">
            {estimate.work.map((code) => {
              const preset = work.find((entry) => entry.code === code);
              if (preset === undefined) return null;
              const entry = estimate.workEntries[code];
              return (
                <PriceRow
                  key={code}
                  glyph={preset.glyph}
                  label={preset.label}
                  detail={`${entry?.days ?? 1} ${entry?.days === 1 ? "day" : "days"}`}
                  amountPaise={entry?.amountPaise ?? null}
                  onPress={() => onPrice(`work:${code}`)}
                />
              );
            })}
            {estimate.materials.map((code) => {
              const preset = materials.find((entry) => entry.code === code);
              if (preset === undefined) return null;
              const entry = estimate.materialEntries[code];
              return (
                <PriceRow
                  key={code}
                  glyph={preset.glyph}
                  label={preset.label}
                  detail={`${entry?.quantity ?? 1} ${preset.unit}`}
                  amountPaise={entry?.amountPaise ?? null}
                  onPress={() => onPrice(`material:${code}`)}
                />
              );
            })}
          </ul>
        </>
      ) : null}

      <Button block size="lg" onClick={onNext} disabled={estimate.work.length === 0}>
        Next
      </Button>
    </div>
  );
}

/** The keypad, opened over the row it prices. */
function PricingSheet({
  pricing,
  estimate,
  work,
  materials,
  onChange,
  onDone,
}: {
  pricing: string;
  estimate: TapEstimate;
  work: readonly WorkPreset[];
  materials: readonly MaterialPreset[];
  onChange: (next: TapEstimate) => void;
  onDone: () => void;
}) {
  const [kind, code] = pricing.split(":");

  if (kind === "work") {
    const preset = work.find((entry) => entry.code === code);
    if (preset === undefined || code === undefined) return null;
    const entry = estimate.workEntries[code];
    return (
      <MoneyPad
        title={preset.label}
        glyph={preset.glyph}
        amountPaise={entry?.amountPaise ?? null}
        onChange={(amountPaise) => onChange(setWorkAmount(estimate, code, amountPaise))}
        onDone={onDone}
      >
        <QuantityStepper
          label="Days on site"
          value={entry?.days ?? 1}
          onChange={(days) => onChange(setWorkDays(estimate, code, days))}
          min={1}
          decrementLabel="One day fewer on site"
          incrementLabel="One more day on site"
        />
      </MoneyPad>
    );
  }

  const preset = materials.find((entry) => entry.code === code);
  if (preset === undefined || code === undefined) return null;
  const entry = estimate.materialEntries[code];
  return (
    <MoneyPad
      title={preset.label}
      glyph={preset.glyph}
      amountPaise={entry?.amountPaise ?? null}
      onChange={(amountPaise) => onChange(setMaterialAmount(estimate, code, amountPaise))}
      onDone={onDone}
    >
      <QuantityStepper
        label={`How many ${preset.unit}`}
        value={entry?.quantity ?? 1}
        onChange={(quantity) => onChange(setMaterialQuantity(estimate, code, quantity))}
        min={1}
        decrementLabel={`One fewer ${preset.unit}`}
        incrementLabel={`One more ${preset.unit}`}
      />
    </MoneyPad>
  );
}

function ExtrasStep({
  estimate,
  askTax,
  onChange,
  onBack,
  onNext,
}: {
  estimate: TapEstimate;
  askTax: boolean;
  onChange: (next: TapEstimate) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const subtotal = tapSubtotal(estimate) ?? 0;
  // Eighteen per cent, shown as the arithmetic rather than named as a rate.
  // A vendor choosing between two tax options is choosing between two numbers,
  // and those are the two numbers.
  const gst = Math.round(subtotal * 0.18);

  return (
    <div className="flex flex-col gap-4">
      {askTax ? (
        <>
          <SectionLabel>Is tax on top?</SectionLabel>
          <div className="flex flex-col gap-2">
            <ChoiceCard
              glyph="➕"
              title="Tax on top"
              detail={`${formatMoney(subtotal)} + ${formatMoney(gst)} = ${formatMoney(subtotal + gst)}`}
              selected={estimate.taxBasis === "EXCLUSIVE"}
              onSelect={() =>
                onChange({ ...estimate, taxBasis: "EXCLUSIVE", taxPaise: gst })
              }
            />
            <ChoiceCard
              glyph="📦"
              title="Price includes tax"
              detail={`Customer pays ${formatMoney(subtotal)}`}
              selected={estimate.taxBasis === "INCLUSIVE"}
              onSelect={() => onChange({ ...estimate, taxBasis: "INCLUSIVE", taxPaise: 0 })}
            />
          </div>
        </>
      ) : null}

      <SectionLabel>Do you guarantee your work?</SectionLabel>
      <TileGrid>
        {WARRANTY_CHOICES.map((choice) => (
          <Tile
            key={choice.code}
            glyph={choice.glyph}
            label={choice.label}
            selected={estimate.warrantyCode === choice.code}
            onToggle={() => onChange({ ...estimate, warrantyCode: choice.code })}
          />
        ))}
      </TileGrid>

      <SectionLabel>Anything you will not do?</SectionLabel>
      <TileGrid>
        {EXCLUSION_CHOICES.map((choice) => (
          <Tile
            key={choice.code}
            glyph={choice.glyph}
            label={choice.label}
            selected={estimate.exclusions.includes(choice.code)}
            onToggle={() => onChange(toggleExclusion(estimate, choice.code))}
          />
        ))}
      </TileGrid>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button block size="lg" onClick={onNext}>
          See my quote
        </Button>
      </div>
    </div>
  );
}

function CheckStep({
  estimate,
  work,
  materials,
  blocked,
  isSubmitting,
  onBack,
  onSend,
}: {
  estimate: TapEstimate;
  work: readonly WorkPreset[];
  materials: readonly MaterialPreset[];
  blocked: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  const warranty = WARRANTY_CHOICES.find((choice) => choice.code === estimate.warrantyCode);

  return (
    <div className="flex flex-col gap-4">
      {/* The same rows, in the same order, with the same glyphs the vendor
          tapped. Nothing new to read at the moment of committing. */}
      <SectionLabel>What the customer will see</SectionLabel>
      <ul className="flex list-none flex-col gap-2 p-0">
        {estimate.work.map((code) => {
          const preset = work.find((entry) => entry.code === code);
          const entry = estimate.workEntries[code];
          if (preset === undefined) return null;
          return (
            <SummaryRow
              key={code}
              glyph={preset.glyph}
              label={`${preset.label} · ${entry?.days ?? 1} ${entry?.days === 1 ? "day" : "days"}`}
              value={entry?.amountPaise == null ? "—" : formatMoney(entry.amountPaise)}
            />
          );
        })}
        {estimate.materials.map((code) => {
          const preset = materials.find((entry) => entry.code === code);
          const entry = estimate.materialEntries[code];
          if (preset === undefined) return null;
          return (
            <SummaryRow
              key={code}
              glyph={preset.glyph}
              label={`${preset.label} · ${entry?.quantity ?? 1} ${preset.unit}`}
              value={entry?.amountPaise == null ? "—" : formatMoney(entry.amountPaise)}
            />
          );
        })}
        {estimate.taxBasis === "EXCLUSIVE" ? (
          <SummaryRow glyph="🧾" label="Tax" value={formatMoney(estimate.taxPaise)} />
        ) : null}
        {warranty !== undefined && warranty.code !== "none" ? (
          <SummaryRow glyph={warranty.glyph} label={`${warranty.label} guarantee`} value="✓" />
        ) : null}
      </ul>

      {blocked !== null ? (
        <p className="text-sm leading-6 text-text-secondary">{blocked}</p>
      ) : null}

      <Button
        block
        size="lg"
        onClick={onSend}
        disabled={blocked !== null}
        loading={isSubmitting}
        loadingLabel="Sending"
      >
        Send to customer
      </Button>
      <Button variant="ghost" onClick={onBack}>
        Change something
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The four shapes this screen is built from
   -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-text">{children}</h2>;
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

/**
 * One tappable thing.
 *
 * `aria-pressed` rather than a checkbox role: these are toggles that change what
 * is on the screen below them, and a screen reader announcing "pressed" is the
 * accurate reading. The glyph is `aria-hidden` because the caption is the name —
 * announcing "paint roller, Paint" says it twice.
 */
function Tile({
  glyph,
  label,
  selected,
  onToggle,
}: {
  glyph: string;
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-card border p-2 text-center",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        selected
          ? "border-2 border-action bg-action-surface"
          : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      <span
        className={cn(
          "text-xs font-semibold leading-tight",
          selected ? "text-action-active" : "text-text-secondary",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function PriceRow({
  glyph,
  label,
  detail,
  amountPaise,
  onPress,
}: {
  glyph: string;
  label: string;
  detail: string;
  amountPaise: number | null;
  onPress: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        )}
      >
        <span aria-hidden className="w-8 text-center text-xl">
          {glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{label}</span>
          <span className="block text-xs text-text-secondary">{detail}</span>
        </span>
        <span
          className={cn(
            "rounded-control border px-3 py-1.5 text-sm font-bold tabular-nums",
            amountPaise === null
              ? "border-line bg-surface-sunken text-text-muted"
              : "border-action-line bg-action-surface text-action-active",
          )}
        >
          {amountPaise === null ? "Set price" : formatMoney(amountPaise)}
        </span>
      </button>
    </li>
  );
}

function ChoiceCard({
  glyph,
  title,
  detail,
  selected,
  onSelect,
}: {
  glyph: string;
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-card border p-3 text-left",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        selected ? "border-2 border-success-text bg-success-surface" : "border-line bg-surface",
      )}
    >
      <span aria-hidden className="text-xl">
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs tabular-nums text-text-secondary">{detail}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
          selected
            ? "border-success-text bg-success-text text-text-inverse"
            : "border-line text-transparent",
        )}
      >
        ✓
      </span>
    </button>
  );
}

function SummaryRow({
  glyph,
  label,
  value,
}: {
  glyph: string;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <span aria-hidden className="w-8 text-center text-xl">
        {glyph}
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-text">{label}</span>
      <span className="text-sm font-bold tabular-nums text-text">{value}</span>
    </li>
  );
}
