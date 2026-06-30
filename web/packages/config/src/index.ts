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
export interface ServiceCard {
  slug: string;
  name: string;
  archetype: ProviderType;
  tagline: string;
}

export const SERVICE_CATALOG: ServiceCard[] = [
  { slug: "electrician", name: "Electrician", archetype: "CAPTAIN", tagline: "Fix wiring, install appliances, and more." },
  { slug: "plumber", name: "Plumber", archetype: "CAPTAIN", tagline: "Resolve leaks, install fixtures, and pipe repairs." },
  { slug: "driver", name: "Driver", archetype: "DRIVER", tagline: "Provide reliable transportation." },
  { slug: "cleaning", name: "Cleaning", archetype: "CLEANER", tagline: "Offer deep cleaning and regular maintenance." },
];

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
    description: "Independent worker (Electrician, Plumber, Driver, Cleaner).",
    requirement: "Requires ID/Aadhaar",
    status: "live",
    serviceSlugs: ["electrician", "plumber", "driver", "cleaning"],
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
