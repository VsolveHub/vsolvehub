import type { ServiceIconName } from "@/lib/icons/flaticon-map";

/** Hand-drawn niche illustrations (public/). */
export const SKETCH_ILLUSTRATIONS = {
  ac: "/ac_general_service_hd.jpg",
  beauty: "/beauty_hd.jpg",
  carpenter: "/carpenter_illustration.jpg",
  cleaner: "/basic_home_cleaning_hd.jpg",
  electrician: "/electrician_illustration.jpg",
  pet: "/pet_hd.jpg",
  plumber: "/plumbing_hd.jpg",
  ro: "/ro_illustration.jpg",
} as const;


/** Specific service slug → HD image (overrides generic category fallbacks). */
const SPECIFIC_HD_IMAGES: Record<string, string> = {
  "ac-deep-cleaning": "/ac_deep_cleaning_hd.jpg",
  "ac-gas-filling": "/ac_gas_filling_hd.jpg",
  "ac-general-service": "/ac_general_service_hd.jpg",
  "basic-facial": "/basic_facial_hd.jpg",
  "basic-home-cleaning": "/basic_home_cleaning_hd.jpg",
  "basin-sink-installation": "/basin_sink_installation_hd.jpg",
  "pet-bath-spa": "/pet_bath_spa_hd.jpg",
  "bathroom-deep-cleaning": "/bathroom_deep_cleaning_hd.jpg",
};

export type SketchKey = keyof typeof SKETCH_ILLUSTRATIONS;

const CATEGORY_SKETCH: Record<string, SketchKey> = {
  technician: "electrician",
  "home-services": "cleaner",
  "pet-services": "pet",
  "construction-services": "carpenter",
  "beauty-wellness": "beauty",
  "event-media-services": "beauty",
  "rental-services": "carpenter",
  "vehicle-services": "electrician",
  "accommodation-services": "cleaner",
  "job-opportunities": "electrician",
  "manpower-support-staff": "cleaner",
  "custom-other-services": "electrician",
};

/** Subcategory / service slug → sketch (from service-card-meta niches). */
const SLUG_SKETCH: Record<string, SketchKey> = {
  electrician: "electrician",
  "electrical-services": "electrician",
  plumber: "plumber",
  "plumbing-services": "plumber",
  carpenter: "carpenter",
  "carpentry-services": "carpenter",
  "ac-technician": "ac",
  "ac-and-ro-services": "ac",
  "ro-technician": "ro",
  "home-cleaning": "cleaner",
  "sofa-carpet-cleaning": "cleaner",
  "pest-control": "cleaner",
  laundry: "cleaner",
  gardening: "cleaner",
  "cleaning-services": "cleaner",
  "cleaning-staff": "cleaner",
  "pet-grooming": "pet",
  veterinary: "pet",
  "pet-walking-boarding": "pet",
  "facial-and-cleanup": "beauty",
  "facial-and-skin-care": "beauty",
  "hair-services": "beauty",
  "waxing-and-threading": "beauty",
  "makeup-services": "beauty",
  "mehendi-services": "beauty",
  "manicure-and-pedicure": "beauty",
  "bridal-packages": "beauty",
  "body-care": "beauty",
  photography: "beauty",
  videography: "beauty",
  decoration: "beauty",
  catering: "beauty",
  "painting-services": "carpenter",
  "mason-work": "carpenter",
  "tile-and-flooring-work": "carpenter",
  "general-labour": "carpenter",
  "welding-and-fabrication": "carpenter",
  "shuttering-and-steel-work": "carpenter",
  "demolition-work": "carpenter",
  "civil-and-road-work": "carpenter",
  waterproofing: "plumber",
  "appliance-repair": "electrician",
  "home-automation": "electrician",
};

export const ICON_SKETCH: Partial<Record<ServiceIconName | string, SketchKey>> = {
  house: "cleaner",
  bolt: "electrician",
  faucet: "plumber",
  beauty: "beauty",
  broom: "cleaner",
  pets: "pet",
  "ac-unit": "ac",
  "water-filter": "ro",
  toolbox: "electrician",
  wrench: "electrician",
  tools: "electrician",
  "hard-hat": "carpenter",
  hammer: "carpenter",
  shovel: "carpenter",
  "brick-wall": "carpenter",
  "welding-mask": "carpenter",
  ibeam: "carpenter",
  "paint-roller": "carpenter",
  briefcase: "carpenter",
  worker: "carpenter",
  camera: "beauty",
  cloche: "beauty",
  "arch-flowers": "beauty",
  calendar: "beauty",
  "calendar-star": "beauty",
  venue: "cleaner",
  buildings: "cleaner",
  "grad-cap": "cleaner",
};

const NAME_RULES: { pattern: RegExp; sketch: SketchKey }[] = [
  { pattern: /\b(ac|air[\s-]?cond|hvac|cooling|gas\s*filling|split)\b/i, sketch: "ac" },
  { pattern: /\b(ro|purifier|water\s*filter)\b/i, sketch: "ro" },
  { pattern: /\b(plumb|pipe|tap|basin|sink|drain|toilet|geyser)\b/i, sketch: "plumber" },
  { pattern: /\b(electric|wiring|switch|fan|mcb|inverter)\b/i, sketch: "electrician" },
  {
    pattern: /\b(clean|bathroom|kitchen|sofa|carpet|pest|laundry|garden|mop|sanitize)\b/i,
    sketch: "cleaner",
  },
  {
    pattern: /\b(facial|makeup|bridal|hair|salon|spa|wax|thread|mani|pedi|mehendi|groom)\b/i,
    sketch: "beauty",
  },
  { pattern: /\b(pet|cat|dog|vet|grooming)\b/i, sketch: "pet" },
  { pattern: /\b(carpent|wood|furniture|door|cabinet)\b/i, sketch: "carpenter" },
  { pattern: /\b(paint|mason|tile|floor|brick|construction|labour|welding|demolition)\b/i, sketch: "carpenter" },
];

export type SketchResolveInput = {
  slug?: string;
  subCategorySlug?: string;
  categorySlug?: string;
  serviceName?: string;
  icon?: ServiceIconName | string;
};

function sketchFromName(name?: string): SketchKey | null {
  if (!name) return null;
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(name)) return rule.sketch;
  }
  return null;
}

export function resolveSketchKey(input: SketchResolveInput): SketchKey {
  const slug = input.subCategorySlug || input.slug;
  if (slug && SLUG_SKETCH[slug]) return SLUG_SKETCH[slug];

  const fromName = sketchFromName(input.serviceName);
  if (fromName) return fromName;

  if (input.icon && ICON_SKETCH[input.icon]) return ICON_SKETCH[input.icon]!;

  if (input.categorySlug && CATEGORY_SKETCH[input.categorySlug]) {
    return CATEGORY_SKETCH[input.categorySlug];
  }

  return "electrician";
}

export function resolveSketchIllustration(input: SketchResolveInput): string {
  const specificSlug = input.slug || input.subCategorySlug;
  if (specificSlug && SPECIFIC_HD_IMAGES[specificSlug]) {
    return SPECIFIC_HD_IMAGES[specificSlug];
  }
  return SKETCH_ILLUSTRATIONS[resolveSketchKey(input)];
}

export function getCategorySketchIllustration(categorySlug: string): string {
  return SKETCH_ILLUSTRATIONS[CATEGORY_SKETCH[categorySlug] ?? "electrician"];
}

/**
 * The single source of truth for "what image does this service show?": the real
 * catalog `imageUrl` when it exists, otherwise the deterministic category sketch.
 * Both the <ServiceImage> component and any raw <Image fill> card use this, so no
 * component keeps its own stock-photo array.
 */
export function serviceImageSrc(input: SketchResolveInput & { imageUrl?: string | null }): string {
  const { imageUrl, ...resolveInput } = input;
  if (imageUrl && imageUrl.trim().length > 0) return imageUrl;
  return resolveSketchIllustration(resolveInput);
}
