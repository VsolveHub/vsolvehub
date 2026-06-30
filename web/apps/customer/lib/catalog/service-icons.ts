/**
 * Emoji icon helpers for the service catalog.
 * Specific services get a distinct icon (matching the booking-flow design);
 * subcategories fall back to a category-themed icon.
 */

/** Per-service icons, keyed by service slug. */
const SERVICE_ICON_BY_SLUG: Record<string, string> = {
  // Electrician
  "switch-repair": "🔘",
  "socket-repair": "🔌",
  "fan-repair": "🌀",
  "power-issue-check": "⚡",
  "short-circuit-fix": "🔥",
  "fan-installation": "🛠️",
  "bulb-tube-light-installation": "💡",
  // Plumbing
  "tap-repair": "🚰",
  "flush-tank-repair": "🚽",
  // Carpentry
  "door-lock-repair": "🔒",
  // Beauty & Wellness
  "face-cleanup": "🧖",
  "basic-facial": "🧴",
  "fruit-facial": "🍓",
};

/** Fallback icons inferred from a service's tags. */
const TAG_ICON: Array<[string, string]> = [
  ["install", "🛠️"],
  ["clean", "🧹"],
  ["paint", "🎨"],
  ["light", "💡"],
  ["fan", "🌀"],
  ["wire", "⚡"],
  ["pipe", "🚰"],
  ["leak", "💧"],
  ["lock", "🔒"],
  ["repair", "🔧"],
];

/** Icons for known subcategories, keyed by subcategory slug. */
const SUBCATEGORY_ICON_BY_SLUG: Record<string, string> = {
  electrician: "⚡",
  "plumbing-services": "🪠",
  "carpentry-services": "🪚",
  "face-care-facial-and-cleanup": "🧴",
  "waxing-and-threading": "🧵",
  "mason-work": "🧱",
  "general-labour": "👷",
  "bar-bending": "🦾",
  shuttering: "🪜",
};

export function getServiceIcon(slug: string, tags: string[] = []): string {
  if (SERVICE_ICON_BY_SLUG[slug]) return SERVICE_ICON_BY_SLUG[slug];
  for (const [needle, icon] of TAG_ICON) {
    if (slug.includes(needle) || tags.some((t) => t.toLowerCase().includes(needle))) {
      return icon;
    }
  }
  return "🔧";
}

export function getSubcategoryIcon(slug: string): string {
  return SUBCATEGORY_ICON_BY_SLUG[slug] ?? "🔧";
}
