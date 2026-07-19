// ─────────────────────────────────────────────────────────────────────────────
// Service booking config — the single source of truth for the config-driven
// ServiceBookingFlow across all four Phase-1 dispatch categories (Technician,
// Beauty & Wellness, Home Services, Pet Services).
//
// For each service we describe:
//   • guidelines   — scope card shown before booking (included / not / good-to-know)
//   • detailFields — priced requirement intake. Selecting requirements turns the
//                    catalog's "starts at" price into an exact quote.
//   • bookingTypes — whether Instant and/or Scheduled are offered
//
// Resolution is layered: service-slug override → sub-category → category default.
// A layer REPLACES the detailFields of the layer above it, so every layer that
// defines detailFields must include its own `variant` field — that field is what
// sets the base price.
//
// The chosen values are serialised into booking.archetypeDetails.details as
// human-readable { label, value } pairs, so the partner app can render them
// without importing this config (no cross-app duplication). The priced breakdown
// is snapshotted separately onto booking.lineItems.
// ─────────────────────────────────────────────────────────────────────────────

import {
  estimatePrice,
  startingPricePaise,
  type PricedDetailField,
  type Selections,
} from "./pricing";

export type BookingTypeOption = "instant" | "scheduled";

/** Detail fields are the priced field union — see ./pricing.ts. */
export type DetailField = PricedDetailField;
export type { PricedDetailField, Selections };

export type ServiceGuidelines = {
  /** One-line scope summary shown under the service name. */
  summary: string;
  included: string[];
  notIncluded: string[];
  goodToKnow: string[];
};

export type ResolvedServiceConfig = {
  guidelines: ServiceGuidelines;
  detailFields: DetailField[];
  bookingTypes: BookingTypeOption[];
  /** Label used for the optional free-text note step. */
  noteLabel: string;
  notePlaceholder: string;
};

type ServiceConfig = {
  guidelines?: Partial<ServiceGuidelines>;
  detailFields?: DetailField[];
  bookingTypes?: BookingTypeOption[];
  noteLabel?: string;
  notePlaceholder?: string;
};

type CategoryConfig = {
  /** Category-level defaults; sub-categories and services layer on top. */
  default: ServiceConfig;
  subCategories?: Record<string, ServiceConfig>;
  services?: Record<string, ServiceConfig>;
};

// ─── Shared defaults ─────────────────────────────────────────────────────────

const GENERIC_GUIDELINES: ServiceGuidelines = {
  summary: "A verified professional will visit and complete the job.",
  included: [
    "Diagnosis and standard workmanship",
    "Verified, background-checked professional",
    "30-day service warranty on workmanship",
  ],
  notIncluded: [
    "Cost of new parts or materials (billed separately)",
    "Major structural or civil work",
  ],
  goodToKnow: [
    "Upfront pricing — you approve the estimate before paying",
    "Free cancellation before a professional is assigned",
  ],
};

/** Fallback so a service with no configured variant still prices at something. */
const GENERIC_FIELDS: DetailField[] = [
  {
    key: "scope",
    label: "Select scope",
    type: "variant",
    required: true,
    options: [
      { value: "Standard visit", pricePaise: 49900, description: "Diagnosis and standard work" },
      { value: "Extended visit", pricePaise: 89900, description: "Complex or multi-point jobs" },
    ],
  },
];

const DEFAULT_BOOKING_TYPES: BookingTypeOption[] = ["instant", "scheduled"];

// ─── Category configs ────────────────────────────────────────────────────────

const TECHNICIAN: CategoryConfig = {
  default: {
    guidelines: {
      summary: "A verified technician will diagnose and fix the reported issue.",
      included: [
        "On-site diagnosis of the fault",
        "Standard repair labour & safety check",
        "Verified, background-checked technician",
        "30-day workmanship warranty",
      ],
      notIncluded: [
        "Cost of new spare parts (billed after inspection)",
        "Full rewiring / re-plumbing / civil work",
      ],
      goodToKnow: [
        "Your estimate is confirmed before the technician is dispatched",
        "Free cancellation before assignment",
      ],
    },
    detailFields: [
      {
        key: "scope",
        label: "Select scope",
        type: "variant",
        required: true,
        options: [
          { value: "Inspection & diagnosis", pricePaise: 29900, description: "Fault finding, no parts" },
          { value: "Standard repair", pricePaise: 49900, description: "Diagnosis plus common repairs" },
          { value: "Major repair", pricePaise: 89900, description: "Extended labour, complex faults" },
        ],
      },
      {
        key: "extras",
        label: "Select add-ons",
        type: "addons",
        options: [
          { value: "Same-day priority", pricePaise: 14900, description: "Jump the queue" },
          { value: "Annual maintenance check", pricePaise: 24900, description: "Full-system health check" },
        ],
      },
    ],
    noteLabel: "Describe the problem (optional)",
    notePlaceholder: "e.g. 2 switches in the master bedroom are sparking",
  },
  services: {
    "switch-socket-repair": {
      detailFields: [
        {
          key: "jobType",
          label: "What do you need?",
          type: "variant",
          required: true,
          options: [
            { value: "Repair a switch / socket", pricePaise: 19900 },
            { value: "Replace a switch / socket", pricePaise: 29900 },
            { value: "Install a new point", pricePaise: 49900 },
          ],
        },
        {
          key: "switchType",
          label: "Switch type",
          type: "select",
          options: [{ value: "Modular" }, { value: "Conventional" }, { value: "Smart switch" }],
          defaultValue: "Modular",
          required: true,
        },
        {
          key: "extraUnits",
          label: "Additional switches / sockets",
          type: "counter",
          min: 0,
          max: 19,
          defaultValue: 0,
          perUnitPaise: 9900,
        },
      ],
    },
    "fan-installation": {
      detailFields: [
        {
          key: "fanType",
          label: "Fan type",
          type: "variant",
          required: true,
          options: [
            { value: "Ceiling fan", pricePaise: 39900 },
            { value: "Wall fan", pricePaise: 29900 },
            { value: "Exhaust fan", pricePaise: 34900 },
          ],
        },
        {
          key: "extraFans",
          label: "Additional fans",
          type: "counter",
          min: 0,
          max: 9,
          defaultValue: 0,
          perUnitPaise: 24900,
        },
      ],
    },
    "ac-general-service": {
      detailFields: [
        {
          key: "acService",
          label: "Select service",
          type: "variant",
          required: true,
          options: [
            { value: "Basic service", pricePaise: 49900, description: "Filter clean & performance check" },
            { value: "Deep jet service", pricePaise: 79900, description: "Full coil jet-wash" },
            { value: "Service + gas check", pricePaise: 99900, description: "Includes gas pressure check" },
          ],
        },
        {
          key: "acType",
          label: "AC type",
          type: "select",
          options: [{ value: "Split" }, { value: "Window" }],
          defaultValue: "Split",
          required: true,
        },
        {
          key: "extraUnits",
          label: "Additional units",
          type: "counter",
          min: 0,
          max: 9,
          defaultValue: 0,
          perUnitPaise: 44900,
        },
      ],
    },
  },
};

const BEAUTY: CategoryConfig = {
  default: {
    guidelines: {
      summary: "A trained beautician brings a hygienic setup to your home.",
      included: [
        "Salon-grade products & sanitised tools",
        "Trained, verified beautician",
        "Single-use disposables where applicable",
      ],
      notIncluded: [
        "Premium add-on products (charged separately)",
        "Services not selected in this booking",
      ],
      goodToKnow: [
        "Your estimate is confirmed before the beautician is dispatched",
        "Please have a clean, well-lit space ready",
      ],
    },
    detailFields: [
      {
        key: "package",
        label: "Select package",
        type: "variant",
        required: true,
        options: [
          { value: "Express (60 min)", pricePaise: 59900, description: "The essentials" },
          { value: "Classic (90 min)", pricePaise: 99900, description: "Most popular" },
          { value: "Premium (2 hr)", pricePaise: 149900, description: "Full pampering session" },
        ],
      },
      {
        key: "extras",
        label: "Select add-ons",
        type: "addons",
        options: [
          { value: "Threading", pricePaise: 9900 },
          { value: "De-tan pack", pricePaise: 29900 },
          { value: "Hair spa", pricePaise: 49900 },
        ],
      },
    ],
    noteLabel: "Preferences (optional)",
    notePlaceholder: "Skin concerns, product preferences, or setup notes…",
  },
};

const HOME: CategoryConfig = {
  default: {
    guidelines: {
      summary: "A verified professional brings supplies and completes the job.",
      included: [
        "Trained, background-checked professional",
        "Standard cleaning supplies & equipment",
        "Re-do if you're not satisfied (report within 24h)",
      ],
      notIncluded: [
        "Heavy furniture shifting beyond the scope",
        "Consumables for extremely soiled surfaces",
      ],
      goodToKnow: [
        "Your estimate is confirmed before the professional is dispatched",
        "Please ensure water & power are available",
      ],
    },
    detailFields: [
      {
        key: "scope",
        label: "Select scope",
        type: "variant",
        required: true,
        options: [
          { value: "Standard clean", pricePaise: 69900 },
          { value: "Deep clean", pricePaise: 129900, description: "Most popular" },
          { value: "Premium deep clean", pricePaise: 199900 },
        ],
      },
      {
        key: "extras",
        label: "Select add-ons",
        type: "addons",
        options: [
          { value: "Sofa shampoo", pricePaise: 49900 },
          { value: "Fridge cleaning", pricePaise: 29900 },
          { value: "Balcony / utility", pricePaise: 19900 },
        ],
      },
    ],
    noteLabel: "Add a note (optional)",
    notePlaceholder: "Access instructions, problem areas, or preferences…",
  },
  subCategories: {
    "home-cleaning": {
      detailFields: [
        {
          key: "homeSize",
          label: "Home size",
          type: "variant",
          required: true,
          options: [
            { value: "1 BHK", pricePaise: 99900 },
            { value: "2 BHK", pricePaise: 129900 },
            { value: "3 BHK", pricePaise: 169900 },
            { value: "4 BHK", pricePaise: 209900 },
            { value: "5+ BHK / Villa", pricePaise: 259900 },
          ],
        },
        {
          key: "cleaningFocus",
          label: "What needs cleaning?",
          type: "select",
          options: [
            { value: "Entire home" },
            { value: "Bedrooms & living" },
            { value: "Kitchen" },
            { value: "Bathrooms" },
            { value: "Balcony / utility" },
          ],
          defaultValue: "Entire home",
          required: true,
          variant: "dropdown",
        },
        // Informational: home size already drives the price here.
        { key: "bathrooms", label: "Number of bathrooms", type: "counter", min: 1, max: 6, defaultValue: 2 },
        {
          key: "extras",
          label: "Select add-ons",
          type: "addons",
          options: [
            { value: "Sofa shampoo", pricePaise: 49900 },
            { value: "Fridge cleaning", pricePaise: 29900 },
          ],
        },
      ],
    },
    "pest-control": {
      detailFields: [
        {
          key: "coverage",
          label: "Select area",
          type: "variant",
          required: true,
          options: [
            { value: "Only kitchen", pricePaise: 99800 },
            { value: "1 Bathroom & kitchen", pricePaise: 109800 },
            { value: "2 Bathrooms & kitchen", pricePaise: 119800 },
            { value: "3 Bathrooms & kitchen", pricePaise: 124900 },
            { value: "Full home", pricePaise: 149900 },
          ],
        },
        {
          key: "propertyType",
          label: "Property type",
          type: "select",
          options: [
            { value: "Apartment" },
            { value: "Independent house" },
            { value: "Villa / Duplex" },
            { value: "Commercial space" },
          ],
          defaultValue: "Apartment",
          required: true,
          variant: "dropdown",
        },
        {
          key: "extras",
          label: "Select add-ons",
          type: "addons",
          options: [
            { value: "Deep sanitisation", pricePaise: 29900 },
            { value: "Odour treatment", pricePaise: 19900 },
          ],
        },
      ],
    },
  },
  // Service-level overrides — a more precise intake for room-specific cleans,
  // where "home size" makes little sense.
  services: {
    "bathroom-deep-cleaning": {
      detailFields: [
        {
          key: "bathroomPackage",
          label: "Select package",
          type: "variant",
          required: true,
          options: [
            { value: "Standard clean", pricePaise: 49900 },
            { value: "Hard water / scaling", pricePaise: 79900 },
            { value: "Post-construction", pricePaise: 119900 },
          ],
        },
        {
          key: "extraBathrooms",
          label: "Additional bathrooms",
          type: "counter",
          min: 0,
          max: 5,
          defaultValue: 0,
          perUnitPaise: 39900,
        },
      ],
    },
    "kitchen-deep-cleaning": {
      detailFields: [
        {
          key: "kitchenPackage",
          label: "Select package",
          type: "variant",
          required: true,
          options: [
            { value: "Standard kitchen", pricePaise: 89900 },
            { value: "With chimney", pricePaise: 129900 },
            { value: "Modular deep clean", pricePaise: 169900 },
          ],
        },
        {
          key: "greaseLevel",
          label: "Grease level",
          type: "select",
          options: [
            { value: "Light" },
            { value: "Moderate" },
            { value: "Heavy / post-construction", priceDeltaPaise: 19900 },
          ],
          defaultValue: "Moderate",
          variant: "dropdown",
        },
      ],
    },
  },
};

const PET: CategoryConfig = {
  default: {
    guidelines: {
      summary: "A caring, trained professional attends to your pet at home.",
      included: [
        "Trained, verified pet handler",
        "Pet-safe products & sanitised equipment",
        "Gentle handling with breaks as needed",
      ],
      notIncluded: [
        "Medication or vaccines (billed separately)",
        "Aggressive-animal handling without prior notice",
      ],
      goodToKnow: [
        "Your estimate is confirmed before the professional is dispatched",
        "Please share your pet's temperament in the note",
      ],
    },
    detailFields: [
      {
        key: "grooming",
        label: "Select service",
        type: "variant",
        required: true,
        options: [
          { value: "Bath & brush", pricePaise: 59900 },
          { value: "Full grooming", pricePaise: 99900, description: "Bath, brush, trim" },
          { value: "Grooming + nail & ear", pricePaise: 129900 },
        ],
      },
      {
        key: "petType",
        label: "Pet",
        type: "select",
        options: [{ value: "Dog" }, { value: "Cat" }, { value: "Other" }],
        defaultValue: "Dog",
        required: true,
      },
      {
        key: "extras",
        label: "Select add-ons",
        type: "addons",
        options: [
          { value: "Tick & flea treatment", pricePaise: 39900 },
          { value: "Teeth cleaning", pricePaise: 24900 },
        ],
      },
    ],
    noteLabel: "About your pet (optional)",
    notePlaceholder: "Breed, temperament, allergies, or special needs…",
  },
};

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  technician: TECHNICIAN,
  "beauty-wellness": BEAUTY,
  "home-services": HOME,
  "pet-services": PET,
};

// ─── Resolver ────────────────────────────────────────────────────────────────

function mergeGuidelines(base: ServiceGuidelines, over?: Partial<ServiceGuidelines>): ServiceGuidelines {
  if (!over) return base;
  return {
    summary: over.summary ?? base.summary,
    included: over.included ?? base.included,
    notIncluded: over.notIncluded ?? base.notIncluded,
    goodToKnow: over.goodToKnow ?? base.goodToKnow,
  };
}

/**
 * Resolve the booking config for a specific service, layering
 * category default → sub-category → service-slug overrides.
 */
export function getServiceConfig(
  categorySlug: string,
  subCategorySlug?: string | null,
  serviceSlug?: string | null,
): ResolvedServiceConfig {
  const category = CATEGORY_CONFIGS[categorySlug];
  const layers: ServiceConfig[] = [];
  if (category) {
    layers.push(category.default);
    if (subCategorySlug && category.subCategories?.[subCategorySlug]) {
      layers.push(category.subCategories[subCategorySlug]!);
    }
    if (serviceSlug && category.services?.[serviceSlug]) {
      layers.push(category.services[serviceSlug]!);
    }
  }

  let guidelines = GENERIC_GUIDELINES;
  let detailFields: DetailField[] = GENERIC_FIELDS;
  let bookingTypes: BookingTypeOption[] = DEFAULT_BOOKING_TYPES;
  let noteLabel = "Add a note (optional)";
  let notePlaceholder = "Anything the professional should know?";

  for (const layer of layers) {
    guidelines = mergeGuidelines(guidelines, layer.guidelines);
    if (layer.detailFields) detailFields = layer.detailFields;
    if (layer.bookingTypes) bookingTypes = layer.bookingTypes;
    if (layer.noteLabel) noteLabel = layer.noteLabel;
    if (layer.notePlaceholder) notePlaceholder = layer.notePlaceholder;
  }

  return { guidelines, detailFields, bookingTypes, noteLabel, notePlaceholder };
}

/** The advertised "Starts at" price for a service — the cheapest variant. */
export function getStartingPricePaise(
  categorySlug: string,
  subCategorySlug?: string | null,
  serviceSlug?: string | null,
): number {
  return startingPricePaise(getServiceConfig(categorySlug, subCategorySlug, serviceSlug).detailFields);
}

/** Default values for a config's detail fields (used to seed flow state). */
export function defaultDetailValues(fields: DetailField[]): Selections {
  const out: Selections = {};
  for (const f of fields) {
    if (f.type === "variant") out[f.key] = f.options[0]?.value ?? "";
    else if (f.type === "addons") out[f.key] = [];
    else if (f.type === "counter") out[f.key] = f.defaultValue ?? f.min ?? 0;
    else if (f.type === "select") out[f.key] = f.defaultValue ?? f.options[0]?.value ?? "";
    else out[f.key] = f.defaultValue ?? "";
  }
  return out;
}

/** Turn selected field values into human-readable { label, value } pairs for storage. */
export function toDetailPairs(
  fields: DetailField[],
  values: Selections,
): { label: string; value: string }[] {
  return fields
    .map((f) => {
      const raw = values[f.key];
      const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
      return { label: f.label, value };
    })
    .filter((p) => p.value !== "");
}

/** Convenience re-export so callers need only one import for config + pricing. */
export { estimatePrice, startingPricePaise };
