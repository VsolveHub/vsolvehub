/**
 * Small, pure helpers shared by the stay property and room forms.
 *
 * The question lists themselves come from the server (`property_schema` for the
 * property, `room_schema` for each room); these only read them.
 */

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

const FIELD_LABELS: Record<string, string> = {
  ac: "AC",
  bathroom: "Bathroom",
  furnishing: "Furnishing",
  food: "Food",
  tier: "Tier",
  gender: "For",
  occupant: "Suited to",
  hostel_type: "Hostel type",
  wifi: "Wi-Fi",
  layout: "Layout",
  parking: "Parking",
  property_type: "Property type",
  duration: "Duration",
  stay_type: "Stay type",
  capacity: "Capacity",
  listing_type: "Listing type",
  star_rating: "Star rating",
};

export function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
): { values: Record<string, string | number | boolean> } | { missing: string } {
  const props = schemaPropertyMap(schema);
  const required = schemaRequiredKeys(schema);
  const values: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(props)) {
    const raw = answers[key]?.trim() ?? "";
    if (!raw) {
      if (required.has(key)) return { missing: labelFor(key) };
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

export const FALLBACK_ROOM_NAMES = ["Standard room", "Deluxe room", "Single", "Double sharing"];
