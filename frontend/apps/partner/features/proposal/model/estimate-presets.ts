/**
 * The words a vendor no longer has to write.
 *
 * ## Why this file exists
 *
 * Sending one project estimate used to mean filling twelve fields, and seven of
 * them could only be reached with a keyboard: the stage name, what it delivers,
 * the material description, its unit, the exclusions and the warranty terms. A
 * vendor standing in a half-built shop holding a phone in one hand cannot type
 * "12 months on workmanship", and a vendor who cannot write cannot send a quote
 * at all.
 *
 * Every entry below is a thing they can tap instead. The `label` is the caption
 * under a glyph rather than the whole meaning, because the point of the redesign
 * is that the picture carries it.
 *
 * ## Why the list is here and not on the server
 *
 * The catalogue is the natural home — it already configures each service, and it
 * is where a new trade would be added. That is a backend slice and a contract
 * version, and this ships without one.
 *
 * So the seam is drawn deliberately: nothing outside this module knows where a
 * preset came from. `workPresetsFor` takes the archetype and returns a list, and
 * the day the server publishes these, that function fetches instead of reading a
 * constant. Callers do not change. What is *not* acceptable is scattering these
 * strings through the components, which is what would make the server version a
 * rewrite rather than a swap.
 *
 * ## Why the deliverable travels with the preset
 *
 * `ProposalStageSerializer.deliverable` is what a dispute reads and what the
 * customer was shown — `engagements.opening` copies it onto the engagement stage
 * for exactly that reason. Leaving it blank because a vendor could not type it
 * would make every tap-built estimate weaker evidence than a typed one. Pairing
 * it with the work means it is always there and always in the same words, which
 * is also the first time two vendors' stages have been comparable.
 *
 * ## Why these are pictograms, not emoji
 *
 * They used to be emoji, for exactly the reason emoji get picked: this app
 * shipped no icon set, and a glyph that renders on every Android in the field
 * beat an SVG sprite nobody had drawn yet. That sprite now exists —
 * `@/components/pictogram`, transcribed from the approved design canvas — so
 * every entry below names one of its icons instead. They stay decorative in
 * the accessibility sense — the caption is still the accessible name — so a
 * pictogram that fails to render loses nothing but decoration, same as an
 * emoji box would have.
 */

import type { PictogramName } from "@/components/pictogram";

/** One piece of work a vendor can tap instead of naming. */
export interface WorkPreset {
  /** Stable across renders and stored in the draft. Never shown. */
  readonly code: string;
  readonly icon: PictogramName;
  /** The caption, and the `title` that goes on the wire. */
  readonly label: string;
  /** Sent as the stage's `deliverable`. See the note above on why it is here. */
  readonly deliverable: string;
}

/** One material a vendor can tap, with the unit it is normally counted in. */
export interface MaterialPreset {
  readonly code: string;
  readonly icon: PictogramName;
  /** The caption, and the material line's `title`. */
  readonly label: string;
  /** Bags, sheets, metres. Sent as `unit`, so the customer can compare quantities. */
  readonly unit: string;
}

const FIT_OUT_WORK: readonly WorkPreset[] = [
  {
    code: "strip_out",
    icon: "clean",
    label: "Strip out",
    deliverable: "Existing fittings removed and the space cleared for new work.",
  },
  {
    code: "civil",
    icon: "walls",
    label: "Walls",
    deliverable: "Walls built, moved or made good as agreed on site.",
  },
  {
    code: "wiring",
    icon: "wiring",
    label: "Wiring",
    deliverable: "Power and lighting circuits run, tested and working.",
  },
  {
    code: "plumbing",
    icon: "water",
    label: "Plumbing",
    deliverable: "Water and drainage lines run, connected and tested.",
  },
  {
    code: "plaster",
    icon: "clean",
    label: "Plaster",
    deliverable: "Surfaces plastered and left smooth and ready to finish.",
  },
  {
    code: "flooring",
    icon: "floor",
    label: "Flooring",
    deliverable: "Floor laid, levelled and finished.",
  },
  {
    code: "paint",
    icon: "paint",
    label: "Paint",
    deliverable: "Surfaces prepared and painted to the agreed finish.",
  },
  {
    code: "fit_out",
    icon: "fit-out",
    label: "Fit out",
    deliverable: "Counters, shelving and fixtures installed and secured.",
  },
  {
    code: "snagging",
    icon: "done",
    label: "Finishing",
    deliverable: "Snags corrected, site cleaned and the space handed over.",
  },
];

const FIT_OUT_MATERIALS: readonly MaterialPreset[] = [
  { code: "cement", icon: "walls", label: "Cement", unit: "bags" },
  { code: "tiles", icon: "floor", label: "Tiles", unit: "boxes" },
  { code: "paint", icon: "paint", label: "Paint", unit: "cans" },
  { code: "wiring", icon: "wiring", label: "Cable", unit: "coils" },
  { code: "timber", icon: "wood", label: "Timber", unit: "sheets" },
  { code: "fittings", icon: "machine", label: "Fittings", unit: "sets" },
];

/**
 * What a vendor can guarantee, as four taps.
 *
 * The wire field is free text (`warranty_terms`), and free text is why no two
 * warranties on this platform have ever been comparable — one vendor writes "1
 * yr", the next writes nothing, and a customer choosing between them is reading
 * two different kinds of silence. A closed set is a small loss of expressiveness
 * and the first time the field has meant anything.
 *
 * `terms` is the sentence that goes on the wire. `label` is what is tapped.
 */
export interface WarrantyChoice {
  readonly code: string;
  readonly icon: PictogramName;
  readonly label: string;
  readonly terms: string;
}

export const WARRANTY_CHOICES: readonly WarrantyChoice[] = [
  { code: "none", icon: "no", label: "None", terms: "" },
  {
    code: "3m",
    icon: "date",
    label: "3 months",
    terms: "Three months on workmanship from handover.",
  },
  {
    code: "6m",
    icon: "date",
    label: "6 months",
    terms: "Six months on workmanship from handover.",
  },
  {
    code: "12m",
    icon: "warranty",
    label: "12 months",
    terms: "Twelve months on workmanship from handover.",
  },
];

/**
 * The things vendors most often say they are not doing.
 *
 * Tapped rather than written, and each one is a whole sentence on the wire so
 * the customer reads a statement rather than a keyword. "Other" is deliberately
 * absent: an exclusion nobody can express in this list is a conversation for the
 * clarification thread, which already exists, rather than a text box reintroduced
 * through the back door.
 */
export interface ExclusionChoice {
  readonly code: string;
  readonly icon: PictogramName;
  readonly label: string;
  readonly sentence: string;
}

export const EXCLUSION_CHOICES: readonly ExclusionChoice[] = [
  {
    code: "permits",
    icon: "papers",
    label: "Permits",
    sentence: "Statutory permits and society approvals are not included.",
  },
  {
    code: "debris",
    icon: "clean",
    label: "Debris removal",
    sentence: "Removing debris from the building is not included.",
  },
  {
    code: "furniture",
    icon: "home",
    label: "Furniture",
    sentence: "Loose furniture and equipment are not included.",
  },
  {
    code: "structural",
    icon: "walls",
    label: "Structural work",
    sentence: "Structural or load-bearing changes are not included.",
  },
  {
    code: "after_hours",
    icon: "time",
    label: "Night work",
    sentence: "Work outside normal site hours is not included.",
  },
];

/**
 * The work a vendor can tap for this enquiry.
 *
 * Takes the archetype so the seam is real rather than notional — today every A5
 * project gets the fit-out list, and the day a second trade needs its own, this
 * signature already carries what decides it.
 */
export function workPresetsFor(_archetype: string): readonly WorkPreset[] {
  return FIT_OUT_WORK;
}

export function materialPresetsFor(_archetype: string): readonly MaterialPreset[] {
  return FIT_OUT_MATERIALS;
}

/** A preset by code, or null. Used when a stored draft is read back. */
export function workPresetByCode(code: string): WorkPreset | null {
  return FIT_OUT_WORK.find((preset) => preset.code === code) ?? null;
}

export function materialPresetByCode(code: string): MaterialPreset | null {
  return FIT_OUT_MATERIALS.find((preset) => preset.code === code) ?? null;
}
