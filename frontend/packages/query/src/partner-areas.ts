/**
 * Partner service areas and requested postal codes logic, shared across web and phone.
 *
 * Designed per Step 3 "Where you work" flow (FLOW.md):
 * - Partners select from open areas and/or type 6-digit Indian PINs.
 * - PIN format: 6 digits, first digit 1-9 (indian_postal_code_validator).
 * - Up to 5 requested PINs per application.
 * - Matching happens on device against open areas' postal_codes.
 * - Can continue if at least 1 area is ticked OR at least 1 PIN is requested.
 */

export const MAX_REQUESTED_PINS = 5;

const PIN_REGEX = /^[1-9][0-9]{5}$/;

export function normalisePin(pin: string): string {
  return pin.trim();
}

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(normalisePin(pin));
}

export interface AreaWithPostalCodes {
  id: string;
  name: string;
  postal_codes?: readonly string[];
  postalCodes?: readonly string[];
}

export type MatchPinResult =
  | {
      kind: "open";
      areas: readonly { id: string; name: string }[];
    }
  | {
      kind: "unknown";
    };

export function matchPin(
  areas: readonly AreaWithPostalCodes[],
  pin: string,
): MatchPinResult {
  const normalised = normalisePin(pin);
  if (!isValidPin(normalised)) {
    return { kind: "unknown" };
  }

  const matching = areas.filter((area) => {
    const codes = area.postal_codes ?? area.postalCodes ?? [];
    return codes.includes(normalised);
  });

  if (matching.length > 0) {
    return {
      kind: "open",
      areas: matching.map((a) => ({ id: a.id, name: a.name })),
    };
  }

  return { kind: "unknown" };
}

export function canContinueStep3(
  tickedAreaIds: readonly string[],
  requestedPins: readonly string[],
): boolean {
  return tickedAreaIds.length > 0 || requestedPins.length > 0;
}
