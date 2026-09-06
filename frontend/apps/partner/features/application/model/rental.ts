export const RENTAL_SKILL_CODES = new Set([
  "tools-machinery",
  "camera-media-equipment",
  "catering-equipment",
  "construction-equipment",
  "coolingheating",
  "decor-items-rent",
  "event-furniture-rental",
  "furniture-rental-homeoffice",
  "home-appliance-rental",
  "lighting-rental",
  "sound-system-rental",
  "tentshamiana",
]);

/** True if the partner application includes rental trades/skills. */
export function isRentalPartner(skillCodes: readonly string[] = []): boolean {
  if (skillCodes.length === 0) return false;
  return skillCodes.some((code) => RENTAL_SKILL_CODES.has(code));
}
