"use client";

import { Button, QuantityStepper, cn, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";

import {
  EXCLUSION_CHOICES,
  WARRANTY_CHOICES,
  materialPresetsFor,
  workPresetsFor,
  type MaterialPreset,
  type WorkPreset,
} from "../model/estimate-presets";
import { byRecentFirst, rememberPreset } from "../model/recent-presets";
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
 * The estimate, built entirely by tapping — on one scroll.
 *
 * ## The rule this screen is made of
 *
 * **The picture is the fast path and the word is the guarantee.** A vendor who
 * reads little can still recognise a paint roller, count days on a stepper, and
 * read `₹15,000`; the caption is what stops them guessing which glyph they are
 * looking at. Digits and the rupee sign are the one piece of text almost
 * everybody in this market reads, so the running total stays the largest thing
 * on the screen.
 *
 * ## No text field, anywhere
 *
 * Unchanged from the version this replaces, and still the point. Work names,
 * deliverables, material descriptions, units, warranty wording and exclusions
 * all come from `estimate-presets`, and every number comes from a keypad or a
 * stepper.
 *
 * ## Why one scroll instead of three steps
 *
 * The three-step version rendered every chosen item **three times** — once as a
 * tile in the preset grid, again as a row in "Put a price on each one", and
 * again as a summary row in the check step — and opened the keypad as a
 * full-screen replacement of the composer, so a five-line estimate cost five
 * complete context switches out of the screen and back. Measured at 360px, that
 * was roughly five viewport-heights of scrolling to send one quote, standing in
 * somebody's half-built shop.
 *
 * Now: the presets live behind a sheet, so the screen lists what the vendor
 * **chose** rather than the catalogue of what they could choose; pricing
 * expands in place on the row it belongs to; the terms collapse to a single
 * line; and the check step is gone, because the sticky bar carries the total
 * and the send and the rows above it are the summary.
 *
 * ## What did not move
 *
 * The wire path. `toOnsiteDraft` → `toOnsiteRequest` is untouched, so this
 * cannot send a shape the typed composer could not send and cannot skip a rule
 * it enforced. `../model/tap-estimate.ts` is not modified by this rewrite.
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
   * the question is not the vendor's to answer, so it is never asked rather than
   * shown as a choice with one option.
   */
  readonly requiredTaxBasis: TaxBasis | null;
  readonly isSubmitting: boolean;
  readonly onSend: (estimate: TapEstimate) => void;
  /** Rendered above the controls. The visit guard, or a server refusal. */
  readonly notice?: React.ReactNode;
}

/** Which bottom sheet is open, if any. `null` is the plain scroll. */
type Sheet =
  | { readonly kind: "pick"; readonly of: "work" | "material" }
  | { readonly kind: "price"; readonly of: "work" | "material"; readonly code: string };

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
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /** The row showing its inline price controls, as `work:code` / `material:code`. */
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  const work = workPresetsFor(archetype);
  const materials = materialPresetsFor(archetype);
  const blocked = tapBlockedReason(estimate);
  const total = tapTotal(estimate);

  function pickWork(code: string): void {
    rememberPreset(code);
    const next = toggleWork(estimate, code);
    setEstimate(next);
    // Opening the row it just added is what makes "tap it, price it" one gesture.
    if (next.work.includes(code)) setOpenRow(`work:${code}`);
  }

  function pickMaterial(code: string): void {
    rememberPreset(code);
    const next = toggleMaterial(estimate, code);
    setEstimate(next);
    if (next.materials.includes(code)) setOpenRow(`material:${code}`);
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {notice}

      {/* ---- What you will do ---- */}
      <section className="flex flex-col gap-2">
        <SectionLabel count={estimate.work.length}>What you will do</SectionLabel>

        {estimate.work.map((code) => {
          const preset = work.find((entry) => entry.code === code);
          if (preset === undefined) return null;
          const entry = estimate.workEntries[code];
          const key = `work:${code}`;
          return (
            <ItemRow
              key={key}
              icon={preset.icon}
              label={preset.label}
              detail={`${entry?.days ?? 1} ${entry?.days === 1 ? "day" : "days"} on site`}
              amountPaise={entry?.amountPaise ?? null}
              open={openRow === key}
              onToggle={() => setOpenRow(openRow === key ? null : key)}
              onRemove={() => setEstimate(toggleWork(estimate, code))}
              removeLabel={`Remove ${preset.label}`}
            >
              <InlinePrice
                amountPaise={entry?.amountPaise ?? null}
                onAdd={(rupees) =>
                  setEstimate(
                    setWorkAmount(estimate, code, (entry?.amountPaise ?? 0) + rupees * 100),
                  )
                }
                onKeypad={() => setSheet({ kind: "price", of: "work", code })}
              />
              <QuantityStepper
                label="Days on site"
                value={entry?.days ?? 1}
                onChange={(days) => setEstimate(setWorkDays(estimate, code, days))}
                min={1}
                decrementLabel="One day fewer on site"
                incrementLabel="One more day on site"
              />
            </ItemRow>
          );
        })}

        <AddButton label="Add work" onClick={() => setSheet({ kind: "pick", of: "work" })} />
      </section>

      {/* ---- Materials ---- */}
      <section className="flex flex-col gap-2">
        <SectionLabel count={estimate.materials.length}>Materials you will buy</SectionLabel>

        {estimate.materials.map((code) => {
          const preset = materials.find((entry) => entry.code === code);
          if (preset === undefined) return null;
          const entry = estimate.materialEntries[code];
          const key = `material:${code}`;
          return (
            <ItemRow
              key={key}
              icon={preset.icon}
              label={preset.label}
              detail={`${entry?.quantity ?? 1} ${preset.unit}`}
              amountPaise={entry?.amountPaise ?? null}
              open={openRow === key}
              onToggle={() => setOpenRow(openRow === key ? null : key)}
              onRemove={() => setEstimate(toggleMaterial(estimate, code))}
              removeLabel={`Remove ${preset.label}`}
            >
              <InlinePrice
                amountPaise={entry?.amountPaise ?? null}
                onAdd={(rupees) =>
                  setEstimate(
                    setMaterialAmount(estimate, code, (entry?.amountPaise ?? 0) + rupees * 100),
                  )
                }
                onKeypad={() => setSheet({ kind: "price", of: "material", code })}
              />
              <QuantityStepper
                label={`How many ${preset.unit}`}
                value={entry?.quantity ?? 1}
                onChange={(quantity) => setEstimate(setMaterialQuantity(estimate, code, quantity))}
                min={1}
                decrementLabel={`One fewer ${preset.unit}`}
                incrementLabel={`One more ${preset.unit}`}
              />
            </ItemRow>
          );
        })}

        <AddButton
          label="Add materials"
          onClick={() => setSheet({ kind: "pick", of: "material" })}
        />
      </section>

      {/* ---- Terms ---- */}
      <TermsSection
        estimate={estimate}
        askTax={requiredTaxBasis === null}
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onChange={setEstimate}
      />

      {/* ---- The commit bar ---- */}
      <CommitBar
        total={total}
        blocked={blocked}
        isSubmitting={isSubmitting}
        onSend={() => onSend(estimate)}
      />

      {sheet?.kind === "pick" ? (
        <PresetSheet
          of={sheet.of}
          work={work}
          materials={materials}
          estimate={estimate}
          onPickWork={pickWork}
          onPickMaterial={pickMaterial}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === "price" ? (
        <PriceSheet
          sheet={sheet}
          estimate={estimate}
          work={work}
          materials={materials}
          onChange={setEstimate}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   The commit bar
   -------------------------------------------------------------------------- */

/**
 * The total and the send, pinned above the tab bar.
 *
 * `bottom-20` rather than `bottom-0`: `PartnerShell` owns a fixed 56px tab bar
 * and pads its content by 80px to clear it, so a bar stuck to the viewport
 * bottom would sit underneath the navigation.
 *
 * This replaces the whole third step. `tapBlockedReason` renders beneath the
 * button as the reason it is dim — that string existed to stop a disabled
 * control dead-ending somebody, and it only does that job where the control is.
 */
function CommitBar({
  total,
  blocked,
  isSubmitting,
  onSend,
}: {
  total: number | null;
  blocked: string | null;
  isSubmitting: boolean;
  onSend: () => void;
}) {
  return (
    <div className="sticky bottom-20 -mx-4 mt-1 flex flex-col gap-2.5 border-t border-line bg-surface px-4 pt-3 pb-3 shadow-[0_-4px_12px_rgb(69_63_55/0.06)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
          Your price
        </span>
        <span
          aria-live="polite"
          className="text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text"
        >
          {total === null ? "—" : formatMoney(total)}
        </span>
      </div>

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

      {blocked === null ? null : (
        <p className="text-center text-xs font-medium text-text-muted">{blocked}</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Terms
   -------------------------------------------------------------------------- */

/**
 * Tax, warranty and exclusions — one line until it is wanted.
 *
 * These were a whole step of their own carrying eleven tiles. Most vendors
 * answer them the same way on every estimate, so the answers are summarised on
 * one row and the controls open in place.
 */
function TermsSection({
  estimate,
  askTax,
  open,
  onOpenChange,
  onChange,
}: {
  estimate: TapEstimate;
  askTax: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: TapEstimate) => void;
}) {
  const subtotal = tapSubtotal(estimate) ?? 0;
  // Eighteen per cent, shown as the arithmetic rather than named as a rate. A
  // vendor choosing between two tax options is choosing between two numbers.
  const gst = Math.round(subtotal * 0.18);
  const warranty = WARRANTY_CHOICES.find((choice) => choice.code === estimate.warrantyCode);

  const summary = [
    estimate.taxBasis === "EXCLUSIVE"
      ? "Tax on top"
      : estimate.taxBasis === "INCLUSIVE"
        ? "Price includes tax"
        : "Tax not chosen",
    warranty === undefined || warranty.code === "none"
      ? "No guarantee"
      : `${warranty.label} guarantee`,
    estimate.exclusions.length === 0
      ? "No exclusions"
      : `${estimate.exclusions.length} exclusion${estimate.exclusions.length === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Your terms</SectionLabel>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Pictogram name="papers" size="md" className="shrink-0 text-action-secondary" />
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-text-secondary">
          {summary}
        </span>
        <Pictogram
          name="go"
          size="sm"
          className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-90")}
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-3">
          {askTax ? (
            <div className="flex flex-col gap-2">
              <SubLabel>Is tax on top?</SubLabel>
              <ChoiceCard
                icon="more"
                title="Tax on top"
                detail={`${formatMoney(subtotal)} + ${formatMoney(gst)} = ${formatMoney(subtotal + gst)}`}
                selected={estimate.taxBasis === "EXCLUSIVE"}
                onSelect={() => onChange({ ...estimate, taxBasis: "EXCLUSIVE", taxPaise: gst })}
              />
              <ChoiceCard
                icon="money"
                title="Price includes tax"
                detail={`Customer pays ${formatMoney(subtotal)}`}
                selected={estimate.taxBasis === "INCLUSIVE"}
                onSelect={() => onChange({ ...estimate, taxBasis: "INCLUSIVE", taxPaise: 0 })}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <SubLabel>Do you guarantee your work?</SubLabel>
            <div className="grid grid-cols-4 gap-2">
              {WARRANTY_CHOICES.map((choice) => (
                <Tile
                  key={choice.code}
                  icon={choice.icon}
                  label={choice.label}
                  selected={estimate.warrantyCode === choice.code}
                  onToggle={() => onChange({ ...estimate, warrantyCode: choice.code })}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SubLabel>Anything you will not do?</SubLabel>
            <div className="grid grid-cols-3 gap-2">
              {EXCLUSION_CHOICES.map((choice) => (
                <Tile
                  key={choice.code}
                  icon={choice.icon}
                  label={choice.label}
                  selected={estimate.exclusions.includes(choice.code)}
                  onToggle={() => onChange(toggleExclusion(estimate, choice.code))}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Rows
   -------------------------------------------------------------------------- */

/**
 * One thing the vendor is charging for, and its price controls when open.
 *
 * The row is a `<div>` with its own buttons rather than one big `<button>`,
 * because it holds a stepper and a remove control — nesting those inside a
 * button is invalid and swallows their taps.
 */
function ItemRow({
  icon,
  label,
  detail,
  amountPaise,
  open,
  onToggle,
  onRemove,
  removeLabel,
  children,
}: {
  icon: PictogramName;
  label: string;
  detail: string;
  amountPaise: number | null;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-card bg-surface p-3",
        open ? "border-2 border-action" : "border border-line",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name={icon} size="lg" className="shrink-0 text-action-secondary" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base font-semibold text-text">{label}</span>
            <span className="truncate text-xs font-medium text-text-muted">{detail}</span>
          </span>
          {amountPaise === null ? (
            <span className="shrink-0 rounded-control border border-action-line bg-action-surface px-3 py-1.5 text-sm font-bold text-action-active">
              Set price
            </span>
          ) : (
            <span className="shrink-0 text-xl font-extrabold tabular-nums tracking-[-0.02em] text-text">
              {formatMoney(amountPaise)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="no" size="sm" className="text-text-muted" />
        </button>
      </div>

      {open ? children : null}
    </div>
  );
}

/**
 * The round numbers a price is actually built out of, on the row itself.
 *
 * Estimates are not typed digit by digit — a vendor pricing plaster thinks
 * "fifteen thousand", not "1-5-0-0-0" — so three taps of `+5,000` is the common
 * path and the keypad is the escape hatch beside it. Both were previously only
 * reachable by replacing the whole screen with `MoneyPad`.
 */
function InlinePrice({
  amountPaise,
  onAdd,
  onKeypad,
}: {
  amountPaise: number | null;
  onAdd: (rupees: number) => void;
  onKeypad: () => void;
}) {
  return (
    <div className="flex gap-2">
      {[1_000, 5_000, 10_000].map((step) => (
        <button
          key={step}
          type="button"
          onClick={() => onAdd(step)}
          className="min-h-11 flex-1 rounded-full border border-info-line bg-info-surface text-sm font-bold tabular-nums text-info-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          +{step.toLocaleString("en-IN")}
        </button>
      ))}
      <button
        type="button"
        onClick={onKeypad}
        aria-label={amountPaise === null ? "Type a price" : "Change this price"}
        className="grid min-h-11 w-13 shrink-0 place-items-center rounded-full bg-action-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Pictogram name="price" size="sm" className="text-action-secondary-text" />
      </button>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-13 items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong text-base font-bold text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Pictogram name="more" size="md" />
      {label}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Sheets
   -------------------------------------------------------------------------- */

/**
 * A bottom sheet — the shape both the preset picker and the keypad take.
 *
 * `fixed inset-0` with its own scrim rather than `<dialog>`: the estimate is
 * long, the sheet must not scroll the page behind it, and `showModal()` makes
 * background content inert in a way that has already stranded one notice in
 * this app behind an unrelated dialog.
 */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-text/40"
      />
      <div className="relative flex max-h-[85dvh] flex-col rounded-t-3xl bg-canvas shadow-overlay">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-base font-bold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Pictogram name="no" size="md" className="text-text-muted" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** The catalogue, moved off the screen and behind a tap. */
function PresetSheet({
  of,
  work,
  materials,
  estimate,
  onPickWork,
  onPickMaterial,
  onClose,
}: {
  of: "work" | "material";
  work: readonly WorkPreset[];
  materials: readonly MaterialPreset[];
  estimate: TapEstimate;
  onPickWork: (code: string) => void;
  onPickMaterial: (code: string) => void;
  onClose: () => void;
}) {
  const isWork = of === "work";
  const presets = isWork ? byRecentFirst(work) : byRecentFirst(materials);
  const chosen = isWork ? estimate.work : estimate.materials;

  return (
    <Sheet title={isWork ? "Add work" : "Add materials"} onClose={onClose}>
      <ul className="flex list-none flex-col gap-2 p-0">
        {presets.map((preset) => {
          const selected = chosen.includes(preset.code);
          return (
            <li key={preset.code}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => (isWork ? onPickWork(preset.code) : onPickMaterial(preset.code))}
                className={cn(
                  "flex min-h-15 w-full items-center gap-3 rounded-card p-3 text-left",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  selected
                    ? "border-2 border-action bg-action-surface"
                    : "border border-line bg-surface",
                )}
              >
                <Pictogram
                  name={preset.icon}
                  size="lg"
                  className={cn(
                    "shrink-0",
                    selected ? "text-action-active" : "text-action-secondary",
                  )}
                />
                <span className="flex-1 text-base font-semibold text-text">{preset.label}</span>
                <Pictogram
                  name={selected ? "done" : "more"}
                  size="md"
                  className={cn("shrink-0", selected ? "text-action-active" : "text-text-muted")}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <Button block size="lg" className="mt-4" onClick={onClose}>
        Done
      </Button>
    </Sheet>
  );
}

/**
 * The keypad, over the estimate rather than instead of it.
 *
 * `MoneyPad` itself is unchanged — the clamping, the whole-rupee handling, the
 * quick-add chips and `MAXIMUM_RUPEES` are all still its own. Only where it is
 * mounted has moved: it used to be an early `return` from `TapEstimate`, which
 * unmounted the entire composer behind it.
 */
function PriceSheet({
  sheet,
  estimate,
  work,
  materials,
  onChange,
  onClose,
}: {
  sheet: { readonly of: "work" | "material"; readonly code: string };
  estimate: TapEstimate;
  work: readonly WorkPreset[];
  materials: readonly MaterialPreset[];
  onChange: (next: TapEstimate) => void;
  onClose: () => void;
}) {
  const { of, code } = sheet;

  if (of === "work") {
    const preset = work.find((entry) => entry.code === code);
    if (preset === undefined) return null;
    const entry = estimate.workEntries[code];
    return (
      <Sheet title={preset.label} onClose={onClose}>
        <MoneyPad
          title={preset.label}
          icon={preset.icon}
          amountPaise={entry?.amountPaise ?? null}
          onChange={(amountPaise) => onChange(setWorkAmount(estimate, code, amountPaise))}
          onDone={onClose}
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
      </Sheet>
    );
  }

  const preset = materials.find((entry) => entry.code === code);
  if (preset === undefined) return null;
  const entry = estimate.materialEntries[code];
  return (
    <Sheet title={preset.label} onClose={onClose}>
      <MoneyPad
        title={preset.label}
        icon={preset.icon}
        amountPaise={entry?.amountPaise ?? null}
        onChange={(amountPaise) => onChange(setMaterialAmount(estimate, code, amountPaise))}
        onDone={onClose}
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
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
   Small shapes
   -------------------------------------------------------------------------- */

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
        {children}
      </h2>
      {count === undefined || count === 0 ? null : (
        <span className="text-[0.6875rem] font-bold text-text-muted">
          {count} {count === 1 ? "thing" : "things"}
        </span>
      )}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-text">{children}</h3>;
}

/**
 * One tappable choice.
 *
 * `aria-pressed` rather than a checkbox role: these are toggles that change what
 * is on the screen below them, and a screen reader announcing "pressed" is the
 * accurate reading. The icon is `aria-hidden` (`Pictogram` sets it internally)
 * because the caption is the name — announcing "paint roller, Paint" says it
 * twice.
 */
function Tile({
  icon,
  label,
  selected,
  onToggle,
}: {
  icon: PictogramName;
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
      <Pictogram name={icon} size="lg" />
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

function ChoiceCard({
  icon,
  title,
  detail,
  selected,
  onSelect,
}: {
  icon: PictogramName;
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
      <Pictogram name={icon} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs tabular-nums text-text-secondary">{detail}</span>
      </span>
      <Pictogram
        name="done"
        size="md"
        className={cn("shrink-0", selected ? "text-success-text" : "text-transparent")}
      />
    </button>
  );
}
