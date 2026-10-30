/**
 * An estimate built by tapping, and how it becomes the estimate that already works.
 *
 * ## Why this converts rather than replaces
 *
 * `OnsiteDraft` and `toOnsiteRequest` carry the working-day arithmetic, the
 * reconciliation rule, the tax handling and the wire shape the server validates.
 * All of that is right and none of it is what made the composer unusable — the
 * *inputs* were. So this models what a vendor taps and then hands the result to
 * the code that already knows what to do with it.
 *
 * The practical consequence is worth stating plainly: the tap flow cannot send a
 * shape the typed composer could not send, and cannot skip a rule the typed one
 * enforced. There is one wire path, and it did not move.
 *
 * ## Why amounts live in a map keyed by preset code
 *
 * A vendor taps work on one screen and prices it on another, and may go back and
 * un-tap. Keeping the price against the code — rather than in a positional list —
 * means un-tapping and re-tapping the same work restores what they had already
 * entered, instead of quietly discarding it. On a phone on a site, losing an
 * amount somebody typed once is losing it for good.
 */

import type { useT } from "@vsolve/ui";

import {
  EXCLUSION_CHOICES,
  WARRANTY_CHOICES,
  materialPresetByCode,
  workPresetByCode,
} from "./estimate-presets";
import type { MaterialDraft, OnsiteDraft, OnsiteStageDraft } from "./onsite-draft";
import type { TaxBasis } from "./proposal-draft";

/** What one tapped piece of work is worth, and how long it takes. */
export interface TapWorkEntry {
  readonly amountPaise: number | null;
  /** Days on site. Defaults to one, because no work takes zero days. */
  readonly days: number;
}

/** What one tapped material costs, and how many of it there are. */
export interface TapMaterialEntry {
  readonly amountPaise: number | null;
  readonly quantity: number;
}

export interface TapEstimate {
  /** Work preset codes, in the order they were tapped. */
  readonly work: readonly string[];
  readonly workEntries: Readonly<Record<string, TapWorkEntry>>;
  readonly materials: readonly string[];
  readonly materialEntries: Readonly<Record<string, TapMaterialEntry>>;
  readonly warrantyCode: string;
  /** Exclusion codes that are switched on. */
  readonly exclusions: readonly string[];
  readonly taxBasis: TaxBasis | null;
  readonly taxPaise: number;
  /** Carried through from the customer's own answer. Never asked for. */
  readonly startsOn: string | null;
}

export const EMPTY_TAP_ESTIMATE: TapEstimate = {
  work: [],
  workEntries: {},
  materials: [],
  materialEntries: {},
  warrantyCode: "none",
  exclusions: [],
  taxBasis: null,
  taxPaise: 0,
  startsOn: null,
};

/** Add or remove a piece of work, keeping any amount already entered for it. */
export function toggleWork(estimate: TapEstimate, code: string): TapEstimate {
  if (estimate.work.includes(code)) {
    return { ...estimate, work: estimate.work.filter((entry) => entry !== code) };
  }
  return {
    ...estimate,
    work: [...estimate.work, code],
    // Only seeded when this code has never been seen. Re-tapping restores what
    // was there rather than blanking it — see the note on the map above.
    workEntries: {
      ...estimate.workEntries,
      [code]: estimate.workEntries[code] ?? { amountPaise: null, days: 1 },
    },
  };
}

export function toggleMaterial(estimate: TapEstimate, code: string): TapEstimate {
  if (estimate.materials.includes(code)) {
    return { ...estimate, materials: estimate.materials.filter((entry) => entry !== code) };
  }
  return {
    ...estimate,
    materials: [...estimate.materials, code],
    materialEntries: {
      ...estimate.materialEntries,
      [code]: estimate.materialEntries[code] ?? { amountPaise: null, quantity: 1 },
    },
  };
}

export function setWorkAmount(
  estimate: TapEstimate,
  code: string,
  amountPaise: number | null,
): TapEstimate {
  const current = estimate.workEntries[code] ?? { amountPaise: null, days: 1 };
  return {
    ...estimate,
    workEntries: { ...estimate.workEntries, [code]: { ...current, amountPaise } },
  };
}

export function setWorkDays(estimate: TapEstimate, code: string, days: number): TapEstimate {
  const current = estimate.workEntries[code] ?? { amountPaise: null, days: 1 };
  return {
    ...estimate,
    workEntries: { ...estimate.workEntries, [code]: { ...current, days: Math.max(1, days) } },
  };
}

export function setMaterialAmount(
  estimate: TapEstimate,
  code: string,
  amountPaise: number | null,
): TapEstimate {
  const current = estimate.materialEntries[code] ?? { amountPaise: null, quantity: 1 };
  return {
    ...estimate,
    materialEntries: { ...estimate.materialEntries, [code]: { ...current, amountPaise } },
  };
}

export function setMaterialQuantity(
  estimate: TapEstimate,
  code: string,
  quantity: number,
): TapEstimate {
  const current = estimate.materialEntries[code] ?? { amountPaise: null, quantity: 1 };
  return {
    ...estimate,
    materialEntries: {
      ...estimate.materialEntries,
      [code]: { ...current, quantity: Math.max(1, quantity) },
    },
  };
}

export function toggleExclusion(estimate: TapEstimate, code: string): TapEstimate {
  return {
    ...estimate,
    exclusions: estimate.exclusions.includes(code)
      ? estimate.exclusions.filter((entry) => entry !== code)
      : [...estimate.exclusions, code],
  };
}

/**
 * What the customer will be asked for, before tax.
 *
 * Null is not zero. A vendor who has tapped three pieces of work and priced one
 * has not quoted `₹15,000` — they have quoted nothing yet, and a running total
 * that showed a real-looking number would be a figure they might send.
 */
export function tapSubtotal(estimate: TapEstimate): number | null {
  const rows = [
    ...estimate.work.map((code) => estimate.workEntries[code]?.amountPaise ?? null),
    ...estimate.materials.map((code) => estimate.materialEntries[code]?.amountPaise ?? null),
  ];
  if (rows.length === 0) return null;
  if (rows.some((row) => row === null)) return null;
  return rows.reduce((sum: number, row) => sum + (row ?? 0), 0);
}

/** What the customer actually pays, tax included. Null while the subtotal is. */
export function tapTotal(estimate: TapEstimate): number | null {
  const subtotal = tapSubtotal(estimate);
  if (subtotal === null) return null;
  return estimate.taxBasis === "EXCLUSIVE" ? subtotal + estimate.taxPaise : subtotal;
}

/**
 * The one gate on sending, as the reason it is not ready.
 *
 * Returns `null` when it is. A string rather than a boolean because a disabled
 * button with no explanation is how a form dead-ends somebody who cannot read
 * the form — which on this screen is the whole point.
 */
export function tapBlockedReason(
  estimate: TapEstimate,
  t: ReturnType<typeof useT>,
): string | null {
  if (estimate.work.length === 0) return t("proposal.tap.blocked.noWork");
  const unpriced = [
    ...estimate.work.filter((code) => estimate.workEntries[code]?.amountPaise == null),
    ...estimate.materials.filter((code) => estimate.materialEntries[code]?.amountPaise == null),
  ];
  if (unpriced.length > 0) return t("proposal.tap.blocked.unpriced");
  if (estimate.taxBasis === null) return t("proposal.tap.blocked.noTax");
  return null;
}

/**
 * The tapped estimate as the draft the existing composer produces.
 *
 * Everything downstream — `validateOnsite`, `scheduleFor`, `onsiteTotal`,
 * `toOnsiteRequest` — takes it from here unchanged, which is what keeps one wire
 * path rather than two.
 *
 * A code with no preset behind it is dropped rather than sent as a blank row. It
 * can only happen when a draft outlives the catalogue entry it was built from,
 * and a stage titled `""` would reach the customer as an unnamed line item.
 */
export function toOnsiteDraft(estimate: TapEstimate): OnsiteDraft {
  const stages: OnsiteStageDraft[] = estimate.work.flatMap((code) => {
    const preset = workPresetByCode(code);
    if (preset === null) return [];
    const entry = estimate.workEntries[code] ?? { amountPaise: null, days: 1 };
    return [
      {
        title: preset.label,
        deliverable: preset.deliverable,
        workingDays: entry.days,
        amountPaise: entry.amountPaise,
      },
    ];
  });

  const materials: MaterialDraft[] = estimate.materials.flatMap((code) => {
    const preset = materialPresetByCode(code);
    if (preset === null) return [];
    const entry = estimate.materialEntries[code] ?? { amountPaise: null, quantity: 1 };
    return [
      {
        description: preset.label,
        quantity: entry.quantity,
        unit: preset.unit,
        amountPaise: entry.amountPaise,
      },
    ];
  });

  const warranty = WARRANTY_CHOICES.find((choice) => choice.code === estimate.warrantyCode);
  const exclusions = estimate.exclusions.flatMap((code) => {
    const choice = EXCLUSION_CHOICES.find((entry) => entry.code === code);
    return choice === undefined ? [] : [choice.sentence];
  });

  return {
    startsOn: estimate.startsOn,
    stages,
    materials,
    exclusions,
    warrantyTerms: warranty?.terms ?? "",
    // Never asked for. The typed composer offered a validity date and almost
    // nobody set one; asking a vendor who cannot read a calendar to pick one is
    // a field that would block the send for no benefit the server requires.
    validUntil: null,
    taxBasis: estimate.taxBasis,
    taxPaise: estimate.taxBasis === "EXCLUSIVE" ? estimate.taxPaise : 0,
  };
}
