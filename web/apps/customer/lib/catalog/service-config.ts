// ─────────────────────────────────────────────────────────────────────────────
// Service booking config — the single source of truth for the config-driven
// ServiceBookingFlow across all four Phase-1 dispatch categories (Technician,
// Beauty & Wellness, Home Services, Pet Services).
//
// For each service we describe:
//   • guidelines   — scope card shown before booking (included / not / good-to-know)
//   • detailFields — structured intake (e.g. Switch Type) that replaces the old
//                    freeform "describe the issue" textarea
//   • bookingTypes — whether Instant and/or Scheduled are offered
//
// Resolution is layered: service-slug override → sub-category → category default.
// The chosen field values are serialised into booking.archetypeDetails.details as
// human-readable { label, value } pairs, so the partner app can render them without
// importing this config (no cross-app duplication).
// ─────────────────────────────────────────────────────────────────────────────

export type BookingTypeOption = "instant" | "scheduled";

export type DetailField =
  | {
      key: string;
      label: string;
      type: "select";
      options: string[];
      defaultValue?: string;
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "counter";
      min?: number;
      max?: number;
      defaultValue?: number;
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      defaultValue?: string;
      required?: boolean;
    };

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
    "Upfront pricing — pay after the professional accepts",
    "Free cancellation before a professional is assigned",
  ],
};

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
        "Pay after the technician accepts your job",
        "Free cancellation before assignment",
      ],
    },
    noteLabel: "Describe the problem (optional)",
    notePlaceholder: "e.g. 2 switches in the master bedroom are sparking",
  },
  services: {
    "switch-socket-repair": {
      detailFields: [
        {
          key: "switchType",
          label: "Switch type",
          type: "select",
          options: ["Modular", "Conventional", "Smart switch"],
          defaultValue: "Modular",
          required: true,
        },
        { key: "quantity", label: "Number of switches / sockets", type: "counter", min: 1, max: 20, defaultValue: 2 },
      ],
    },
    "fan-installation": {
      detailFields: [
        {
          key: "fanType",
          label: "Fan type",
          type: "select",
          options: ["Ceiling", "Wall", "Exhaust"],
          defaultValue: "Ceiling",
          required: true,
        },
        { key: "quantity", label: "Number of fans", type: "counter", min: 1, max: 10, defaultValue: 1 },
      ],
    },
    "ac-general-service": {
      detailFields: [
        {
          key: "acType",
          label: "AC type",
          type: "select",
          options: ["Split", "Window"],
          defaultValue: "Split",
          required: true,
        },
        { key: "quantity", label: "Number of units", type: "counter", min: 1, max: 10, defaultValue: 1 },
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
        "Pay after the beautician accepts your booking",
        "Please have a clean, well-lit space ready",
      ],
    },
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
        "Pay after the professional accepts",
        "Please ensure water & power are available",
      ],
    },
    noteLabel: "Add a note (optional)",
    notePlaceholder: "Access instructions, problem areas, or preferences…",
  },
  subCategories: {
    "home-cleaning": {
      detailFields: [
        {
          key: "homeSize",
          label: "Home size",
          type: "select",
          options: ["1 BHK", "2 BHK", "3 BHK", "4+ BHK / Villa"],
          defaultValue: "2 BHK",
          required: true,
        },
      ],
    },
    "pest-control": {
      detailFields: [
        {
          key: "propertyType",
          label: "Property type",
          type: "select",
          options: ["Apartment", "Independent house", "Commercial"],
          defaultValue: "Apartment",
          required: true,
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
        "Pay after the professional accepts",
        "Please share your pet's temperament in the note",
      ],
    },
    detailFields: [
      {
        key: "petType",
        label: "Pet",
        type: "select",
        options: ["Dog", "Cat", "Other"],
        defaultValue: "Dog",
        required: true,
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
  let detailFields: DetailField[] = [];
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

/** Default values for a config's detail fields (used to seed flow state). */
export function defaultDetailValues(fields: DetailField[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    if (f.type === "counter") out[f.key] = f.defaultValue ?? f.min ?? 1;
    else out[f.key] = f.defaultValue ?? (f.type === "select" ? f.options[0] ?? "" : "");
  }
  return out;
}

/** Turn selected field values into human-readable { label, value } pairs for storage. */
export function toDetailPairs(
  fields: DetailField[],
  values: Record<string, string | number>,
): { label: string; value: string }[] {
  return fields
    .map((f) => ({ label: f.label, value: String(values[f.key] ?? "") }))
    .filter((p) => p.value !== "");
}
