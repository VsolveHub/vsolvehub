/**
 * Small, pure helpers shared by the stay property and room forms.
 *
 * The question lists themselves come from the server (`property_schema` for the
 * property, `room_schema` for each room); these only read them.
 */

import type { useT } from "@vsolve/ui";

type Translate = ReturnType<typeof useT>;

export type SchemaProperty = {
  type?: string;
  enum?: unknown[];
};

export function schemaPropertyMap(
  schema: Record<string, unknown> | undefined,
): Record<string, SchemaProperty> {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as Record<string, SchemaProperty>;
}

export function schemaRequiredKeys(schema: Record<string, unknown> | undefined): Set<string> {
  const required = schema?.required;
  if (!Array.isArray(required)) return new Set();
  return new Set(required.filter((key): key is string => typeof key === "string"));
}

/** Catalogue keys for the schema questions we have a proper name for. */
const FIELD_LABEL_KEYS: Record<string, string> = {
  ac: "stays.field.ac",
  bathroom: "stays.field.bathroom",
  furnishing: "stays.field.furnishing",
  food: "stays.field.food",
  tier: "stays.field.tier",
  gender: "stays.field.gender",
  occupant: "stays.field.occupant",
  hostel_type: "stays.field.hostelType",
  wifi: "stays.field.wifi",
  layout: "stays.field.layout",
  parking: "stays.field.parking",
  property_type: "stays.field.propertyType",
  duration: "stays.field.duration",
  stay_type: "stays.field.stayType",
  capacity: "stays.field.capacity",
  listing_type: "stays.field.listingType",
  star_rating: "stays.field.starRating",
};

export function labelFor(key: string, t: Translate): string {
  const labelKey = FIELD_LABEL_KEYS[key];
  if (labelKey) return t(labelKey);
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** The most one photo may weigh; the server refuses anything larger. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE_KEY = "stays.photos.tooLarge";

/** Splits chosen files into those small enough to upload and a message about the rest. */
export function splitBySize(
  files: readonly File[],
  t: Translate,
): { ok: File[]; tooLarge: string | null } {
  const ok = files.filter((file) => file.size <= MAX_PHOTO_BYTES);
  return { ok, tooLarge: ok.length < files.length ? t(PHOTO_TOO_LARGE_KEY) : null };
}

export type AmenityOption = { key: string; label: string };

/** The ticked amenities already saved on a property, from its answers. */
export function amenitiesFrom(
  fields: unknown,
  options: readonly AmenityOption[] | undefined,
): Record<string, boolean> {
  const values = fields && typeof fields === "object" ? (fields as Record<string, unknown>) : {};
  return Object.fromEntries((options ?? []).map(({ key }) => [key, values[key] === true]));
}

/** Rupees as typed ("₹1,250.50") to integer paise, or null when it is not a price. */
export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

export function paiseToRupeeInput(paise: number): string {
  return (paise / 100).toString();
}

/** A whole number ≥ `min` from a text input, or null. */
export function wholeNumber(input: string, min = 1): number | null {
  const value = Number.parseInt(input.trim(), 10);
  if (!Number.isFinite(value) || value < min || String(value) !== input.trim()) return null;
  return value;
}

/**
 * Schema answers as typed (all strings) to the values the server stores.
 * Returns the first missing required question instead when there is one.
 */
export function collectSchemaAnswers(
  schema: Record<string, unknown> | undefined,
  answers: Record<string, string>,
  t: Translate,
): { values: Record<string, string | number | boolean> } | { missing: string } {
  const props = schemaPropertyMap(schema);
  const required = schemaRequiredKeys(schema);
  const values: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(props)) {
    const raw = answers[key]?.trim() ?? "";
    if (!raw) {
      if (required.has(key)) return { missing: labelFor(key, t) };
      continue;
    }
    if (props[key]?.type === "boolean") values[key] = raw === "true";
    else if (props[key]?.type === "number") values[key] = Number(raw);
    else values[key] = raw;
  }
  return { values };
}

export function answersFrom(values: unknown): Record<string, string> {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  );
}

export const FALLBACK_ROOM_NAMES = [
  "Single Room",
  "Double Sharing",
  "Triple Sharing",
  "Deluxe Room",
  "Dormitory Bed",
  "Studio",
  "Executive Room",
];
