// Config-driven onboarding. The three Figma flows (Captain / Driver / Cleaner)
// are one wizard whose step list comes from here — no per-flow code.

export type ProviderType = "CAPTAIN" | "DRIVER" | "CLEANER";

export type WizardStepId =
  | "identity"
  | "skills"
  | "vehicle"
  | "documents"
  | "success";

export interface WizardStep {
  id: WizardStepId;
  title: string;
  subtitle?: string;
}

export interface ProviderFlow {
  type: ProviderType;
  label: string;
  /** Ordered wizard steps for this provider type. */
  steps: WizardStep[];
  /** Dashboard sidebar tabs. */
  tabs: string[];
}

const IDENTITY: WizardStep = { id: "identity", title: "Identity", subtitle: "Verify who you are" };
const SUCCESS: WizardStep = { id: "success", title: "Application Success" };

export const PROVIDER_FLOWS: Record<ProviderType, ProviderFlow> = {
  CAPTAIN: {
    type: "CAPTAIN",
    label: "Captain",
    steps: [
      IDENTITY,
      { id: "skills", title: "Skills & Documents", subtitle: "Your trade and proof" },
      SUCCESS,
    ],
    tabs: ["Dashboard", "My Jobs", "Earnings", "Documents", "Skills", "Support"],
  },
  DRIVER: {
    type: "DRIVER",
    label: "Driver",
    steps: [
      IDENTITY,
      { id: "vehicle", title: "Vehicle Details", subtitle: "About your vehicle" },
      { id: "documents", title: "Documents", subtitle: "RC, license and more" },
      SUCCESS,
    ],
    tabs: ["Dashboard", "My Trips", "Earnings", "Vehicle & Documents", "Support"],
  },
  CLEANER: {
    type: "CLEANER",
    label: "Home Cleaner",
    steps: [
      { id: "identity", title: "Identity & Gender", subtitle: "Verify who you are" },
      { id: "skills", title: "Skills & Verification", subtitle: "Your services and proof" },
      SUCCESS,
    ],
    tabs: ["Dashboard", "My Jobs", "Earnings", "Documents", "Skills", "Support"],
  },
};

// Public service catalog shown on the marketing landing + /become-a/[service].
/** Plain-language, customer-recognisable category. The archetype stays internal. */
export type ServiceCategoryId = "technician" | "beauty" | "home" | "pet" | "driver";

export interface ServiceCard {
  slug: string;
  name: string;
  archetype: ProviderType;
  tagline: string;
  category: ServiceCategoryId;
}

export interface PartnerCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** "live" categories can onboard now; "coming-soon" show a waitlist. */
  status: "live" | "coming-soon";
}

/** Top-level "what work do you do?" choices shown to partners (no jargon). */
export const PARTNER_CATEGORIES: PartnerCategory[] = [
  { id: "technician", name: "Technician", icon: "🔧", description: "Electrician, plumber, carpenter, AC & RO work", status: "live" },
  { id: "beauty", name: "Beauty & Wellness", icon: "💄", description: "Facial, hair, makeup, waxing & nail care", status: "live" },
  { id: "home", name: "Home Services", icon: "🧹", description: "Cleaning, pest control, laundry & gardening", status: "live" },
  { id: "pet", name: "Pet Services", icon: "🐾", description: "Grooming, vet visits, walking & boarding", status: "live" },
  { id: "rentals", name: "Rentals", icon: "📦", description: "Rent out equipment, furniture & vehicles", status: "coming-soon" },
  { id: "property", name: "Property Host", icon: "🏠", description: "List rooms, PGs, hostels & rentals", status: "coming-soon" },
  { id: "events", name: "Events & Media", icon: "🎥", description: "Photography, catering, decor & DJ", status: "coming-soon" },
  { id: "jobs", name: "Hire Staff", icon: "💼", description: "Post jobs & hire local talent", status: "coming-soon" },
];

export const SERVICE_CATALOG: ServiceCard[] = [
  { slug: "electrician", name: "Electrician", archetype: "CAPTAIN", category: "technician", tagline: "Fix wiring, install appliances, and more." },
  { slug: "plumber", name: "Plumber", archetype: "CAPTAIN", category: "technician", tagline: "Resolve leaks, install fixtures, and pipe repairs." },
  { slug: "carpenter", name: "Carpenter", archetype: "CAPTAIN", category: "technician", tagline: "Repair doors, locks, hinges and assemble furniture." },
  { slug: "ac-technician", name: "AC Technician", archetype: "CAPTAIN", category: "technician", tagline: "Service, deep-clean, install and refill AC units." },
  { slug: "ro-technician", name: "RO Technician", archetype: "CAPTAIN", category: "technician", tagline: "Service, install and replace filters for RO purifiers." },
  { slug: "facial-and-cleanup", name: "Facial & Cleanup", archetype: "CAPTAIN", category: "beauty", tagline: "At-home facial, cleanup and skin-care services." },
  { slug: "waxing-and-threading", name: "Waxing & Threading", archetype: "CAPTAIN", category: "beauty", tagline: "Waxing, threading and grooming appointments at home." },
  { slug: "hair-services", name: "Hair Services", archetype: "CAPTAIN", category: "beauty", tagline: "Hair cut, styling, spa and colour services." },
  { slug: "manicure-and-pedicure", name: "Manicure & Pedicure", archetype: "CAPTAIN", category: "beauty", tagline: "Hand, foot and nail-care services at home." },
  { slug: "makeup", name: "Makeup", archetype: "CAPTAIN", category: "beauty", tagline: "Party, bridal and occasion makeup services." },
  { slug: "home-cleaning", name: "Home Cleaning", archetype: "CAPTAIN", category: "home", tagline: "Basic, deep, kitchen and bathroom cleaning jobs." },
  { slug: "sofa-carpet-cleaning", name: "Sofa & Carpet Cleaning", archetype: "CAPTAIN", category: "home", tagline: "Deep cleaning for sofas, carpets and mattresses." },
  { slug: "pest-control", name: "Pest Control", archetype: "CAPTAIN", category: "home", tagline: "Pest, cockroach, termite and bed-bug treatments." },
  { slug: "laundry", name: "Laundry", archetype: "CAPTAIN", category: "home", tagline: "Wash, fold, dry-cleaning and ironing services." },
  { slug: "gardening", name: "Gardening", archetype: "CAPTAIN", category: "home", tagline: "Garden cleaning, lawn mowing and plant care." },
  { slug: "pet-grooming", name: "Pet Grooming", archetype: "CAPTAIN", category: "pet", tagline: "Dog, cat, bath, spa and nail-care services." },
  { slug: "veterinary", name: "Veterinary", archetype: "CAPTAIN", category: "pet", tagline: "At-home check-ups, vaccination and deworming." },
  { slug: "pet-walking-boarding", name: "Pet Walking & Boarding", archetype: "CAPTAIN", category: "pet", tagline: "Dog walking, pet daycare and boarding services." },
  { slug: "driver", name: "Driver", archetype: "DRIVER", category: "driver", tagline: "Provide reliable transportation." },
];

/**
 * Specific skills / sub-services a partner can offer, per trade. Config-driven
 * (not DB-seeded) so the onboarding skills list is never empty.
 */
export const SERVICE_SKILLS: Record<string, string[]> = {
  electrician: ["Switch & socket repair", "Fan installation", "Light & LED fitting", "House wiring", "Power issue check", "Short circuit fix", "MCB & fuse", "Inverter setup"],
  plumber: ["Tap repair", "Leak fixing", "Drain cleaning", "WC & flush repair", "Basin & sink fitting", "Pipe fitting", "Motor & pump", "Bathroom fittings"],
  carpenter: ["Door & lock repair", "Furniture assembly", "Cupboard & hinges", "Curtain rods", "Wood polishing", "Modular fittings"],
  "ac-technician": ["AC service", "AC deep cleaning", "Gas refill", "AC installation", "AC uninstall", "Cooling repair"],
  "ro-technician": ["RO service", "Filter replacement", "RO installation", "RO repair", "Water quality check"],
  "facial-and-cleanup": ["Face cleanup", "Basic facial", "Gold facial", "Diamond facial", "De-tan", "Bleach"],
  "waxing-and-threading": ["Full arms wax", "Full legs wax", "Underarms wax", "Eyebrow threading", "Face threading", "Full body wax"],
  "hair-services": ["Hair cut", "Hair styling", "Hair spa", "Hair colour", "Straightening", "Dandruff treatment"],
  "manicure-and-pedicure": ["Basic manicure", "Spa pedicure", "Gel polish", "Nail art", "Foot spa"],
  makeup: ["Party makeup", "Bridal makeup", "HD makeup", "Engagement makeup", "Saree draping"],
  "home-cleaning": ["Basic cleaning", "Deep cleaning", "Kitchen cleaning", "Bathroom cleaning", "Move-in / move-out"],
  "sofa-carpet-cleaning": ["Sofa shampooing", "Carpet cleaning", "Mattress cleaning", "Curtain cleaning"],
  "pest-control": ["General pest control", "Cockroach control", "Termite control", "Bed bug control", "Mosquito control"],
  laundry: ["Wash & fold", "Dry cleaning", "Steam ironing", "Shoe cleaning"],
  gardening: ["Garden cleaning", "Lawn mowing", "Plant care", "Tree trimming"],
  "pet-grooming": ["Dog grooming", "Cat grooming", "Bath & spa", "Nail clipping", "Ear cleaning"],
  veterinary: ["General check-up", "Vaccination", "Deworming", "Emergency care"],
  "pet-walking-boarding": ["Dog walking", "Pet day care", "Pet boarding", "Pet sitting"],
  driver: ["City rides", "Outstation trips", "Airport transfers"],
};

/** Skills for a trade; falls back to a generic set if the slug is unknown. */
export function skillsForService(slug: string): string[] {
  return SERVICE_SKILLS[slug] ?? ["General service", "Repairs", "Installation"];
}

/** Live services under a category, in catalog order. */
export function servicesForCategory(categoryId: string): ServiceCard[] {
  return SERVICE_CATALOG.filter((s) => s.category === categoryId);
}

export function partnerCategoryById(id: string): PartnerCategory | undefined {
  return PARTNER_CATEGORIES.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Partner roles — the top-level "archetype" layer shown on the landing
// "Choose your path" strip and the /solutions role chooser. A role sits ABOVE
// the ProviderType/service model: today only CAPTAIN-family services are live,
// the rest are marketed as "coming soon" until their flows are built.
// ---------------------------------------------------------------------------
export type RoleSlug =
  | "captain"
  | "professional"
  | "rental-vendor"
  | "property-host"
  | "event-vendor"
  | "employer";

export interface PartnerRole {
  slug: RoleSlug;
  name: string;
  /** One-line pitch shown on the role card. */
  description: string;
  /** Headline eligibility, e.g. "Requires ID/Aadhaar". */
  requirement: string;
  /** "live" routes into the real flow; "coming-soon" shows a waitlist view. */
  status: "live" | "coming-soon";
  /** Service slugs this role umbrellas (only meaningful when live). */
  serviceSlugs: string[];
}

export const PARTNER_ROLES: PartnerRole[] = [
  {
    slug: "captain",
    name: "Captain",
    description: "Independent service partner for technician, beauty, home and pet jobs.",
    requirement: "Requires ID/Aadhaar",
    status: "live",
    serviceSlugs: [
      "electrician",
      "plumber",
      "carpenter",
      "ac-technician",
      "ro-technician",
      "facial-and-cleanup",
      "waxing-and-threading",
      "hair-services",
      "manicure-and-pedicure",
      "makeup",
      "home-cleaning",
      "sofa-carpet-cleaning",
      "pest-control",
      "laundry",
      "gardening",
      "pet-grooming",
      "veterinary",
      "pet-walking-boarding",
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    description: "Staffing services (Cook, Nurse, Security).",
    requirement: "Requires Certifications",
    status: "coming-soon",
    serviceSlugs: [],
  },
  {
    slug: "rental-vendor",
    name: "Rental Vendor",
    description: "Vehicle and Equipment rentals.",
    requirement: "Requires GST & RC",
    status: "coming-soon",
    serviceSlugs: [],
  },
  {
    slug: "property-host",
    name: "Property Host",
    description: "Manage PGs or Rooms.",
    requirement: "Requires Ownership Proof",
    status: "coming-soon",
    serviceSlugs: [],
  },
  {
    slug: "event-vendor",
    name: "Event Vendor",
    description: "Catering, Decor, or Photography.",
    requirement: "Requires Portfolio",
    status: "coming-soon",
    serviceSlugs: [],
  },
  {
    slug: "employer",
    name: "Employer",
    description: "Post jobs and hire local talent.",
    requirement: "Requires Business Registration",
    status: "coming-soon",
    serviceSlugs: [],
  },
];

export function roleBySlug(slug: string): PartnerRole | undefined {
  return PARTNER_ROLES.find((r) => r.slug === slug);
}

/** Services umbrellaed by a role, resolved against the service catalog. */
export function servicesForRole(slug: string): ServiceCard[] {
  const role = roleBySlug(slug);
  if (!role) return [];
  return role.serviceSlugs
    .map((s) => serviceBySlug(s))
    .filter((s): s is ServiceCard => Boolean(s));
}

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;

/** Work-experience bands offered during onboarding. Single source of truth for
 *  both the identity form dropdown and the server action's validation. */
export const EXPERIENCE_BANDS = [
  { value: "0-6m", label: "0 – 6 months" },
  { value: "6-12m", label: "6 – 12 months" },
  { value: "1-3y", label: "1 – 3 years" },
  { value: "3y+", label: "More than 3 years" },
] as const;

export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number]["value"];

export function isExperienceBand(value: string): value is ExperienceBand {
  return EXPERIENCE_BANDS.some((b) => b.value === value);
}

/** Wizard steps for a provider type, excluding the terminal "success" step. */
export function formStepsFor(type: ProviderType): WizardStep[] {
  return PROVIDER_FLOWS[type].steps.filter((s) => s.id !== "success");
}

export function serviceBySlug(slug: string): ServiceCard | undefined {
  return SERVICE_CATALOG.find((s) => s.slug === slug);
}

/** "What you'll need" checklist shown on the onboarding intro, per archetype. */
export const ONBOARDING_REQUIREMENTS: Record<
  ProviderType,
  { title: string; body: string }[]
> = {
  CAPTAIN: [
    { title: "Aadhaar via DigiLocker", body: "For quick and secure identity verification." },
    { title: "Profile photo", body: "A clear photo for your partner profile." },
  ],
  CLEANER: [
    { title: "Aadhaar via DigiLocker", body: "For quick and secure identity verification." },
    { title: "Profile photo", body: "A clear photo for your partner profile." },
  ],
  DRIVER: [
    { title: "Aadhaar via DigiLocker", body: "For quick and secure identity verification." },
    { title: "Driving licence & RC", body: "Valid licence and vehicle registration." },
  ],
};

export * from "./timing";

