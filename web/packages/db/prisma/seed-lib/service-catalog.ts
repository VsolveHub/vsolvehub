/** VSolveHub service catalog — categories, subcategories, and specific services (source of truth for seed). */

export type SeedServiceDef = {
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  durationMinutes: number;
  archetype?: string;
  unit?: string;
  tags?: string[];
};

export type SeedSubCategoryDef = {
  name: string;
  slug: string;
  services: SeedServiceDef[];
};

export type CatalogCategoryDef = {
  name: string;
  slug: string;
  tagline: string;
  icon: string;
  sortOrder: number;
  archetype: string;
  unit: string;
  basePricePaise: number;
  durationMinutes: number;
  subCategories: SeedSubCategoryDef[];
};

export const SERVICE_CATALOG: CatalogCategoryDef[] = [
  // ─── 1. Technician — on-demand fixed-price single-provider trades ──────────
  {
    name: "Technician",
    slug: "technician",
    tagline: "Electricians, plumbers, AC, RO & appliance experts at your door",
    icon: "🔧",
    sortOrder: 1,
    archetype: "A",
    unit: "visit",
    basePricePaise: 9900,
    durationMinutes: 60,
    subCategories: [
      {
        name: "Electrician",
        slug: "electrician",
        services: [
          { name: "Switch / Socket Repair", slug: "switch-socket-repair", description: "Repair faulty switches, modular boards, or sparking sockets.", pricePaise: 12900, durationMinutes: 30, tags: ["switch", "socket", "electrical"] },
          { name: "Fan Installation", slug: "fan-installation", description: "Assembly, mounting and wiring of a new ceiling or wall fan.", pricePaise: 24900, durationMinutes: 60, tags: ["fan", "install"] },
          { name: "Light / LED Installation", slug: "light-led-installation", description: "Install LED bulbs, tube lights or decorative panel lights.", pricePaise: 12900, durationMinutes: 30, tags: ["light", "led", "tubelight"] },
          { name: "Power Issue Check", slug: "power-issue-check", description: "Diagnose partial power failure, MCB tripping or fuse issues.", pricePaise: 19900, durationMinutes: 45, tags: ["power", "mcb", "fuse"] },
          { name: "Short Circuit Fix", slug: "short-circuit-fix", description: "Identify and resolve short circuits and burned wiring.", pricePaise: 34900, durationMinutes: 90, tags: ["short-circuit", "wiring"] },
        ],
      },
      {
        name: "Plumber",
        slug: "plumber",
        services: [
          { name: "Tap Repair & Leakage", slug: "tap-repair", description: "Fix leaking taps, pipe joints or spindle replacements.", pricePaise: 19900, durationMinutes: 30, tags: ["tap", "leak"] },
          { name: "Drain Block Removal", slug: "drain-block-removal", description: "Clear blocked drains, sinks and bathroom outlets.", pricePaise: 29900, durationMinutes: 45, tags: ["drain", "block"] },
          { name: "WC / Flush Repair", slug: "wc-flush-repair", description: "Repair faulty flush valves, syphons or wall-hung flush units.", pricePaise: 24900, durationMinutes: 45, tags: ["flush", "wc", "toilet"] },
          { name: "Basin / Sink Installation", slug: "basin-sink-installation", description: "Install or replace wash basins and kitchen sinks.", pricePaise: 39900, durationMinutes: 60, tags: ["basin", "sink", "install"] },
        ],
      },
      {
        name: "Carpenter",
        slug: "carpenter",
        services: [
          { name: "Door / Lock Repair", slug: "door-lock-repair", description: "Fix handle locks, latches or key-rotation issues on doors.", pricePaise: 24900, durationMinutes: 40, tags: ["door", "lock"] },
          { name: "Furniture Assembly", slug: "furniture-assembly", description: "Assemble beds, tables, wardrobes and flat-pack furniture.", pricePaise: 39900, durationMinutes: 60, tags: ["furniture", "assembly"] },
          { name: "Cupboard / Hinge Repair", slug: "cupboard-hinge-repair", description: "Repair cupboard shutters, hinges and drawer channels.", pricePaise: 29900, durationMinutes: 45, tags: ["cupboard", "hinge"] },
        ],
      },
      {
        name: "AC Technician",
        slug: "ac-technician",
        services: [
          { name: "AC General Service", slug: "ac-general-service", description: "Standard service: coil clean, filter wash and gas-pressure check.", pricePaise: 59900, durationMinutes: 60, tags: ["ac", "service"], unit: "unit" },
          { name: "AC Deep Cleaning", slug: "ac-deep-cleaning", description: "Jet-wash deep cleaning of indoor and outdoor AC units.", pricePaise: 99900, durationMinutes: 75, tags: ["ac", "cleaning"], unit: "unit" },
          { name: "Split AC Installation", slug: "split-ac-installation", description: "Mounting, piping and commissioning of a split AC.", pricePaise: 199900, durationMinutes: 120, tags: ["ac", "install"], unit: "unit" },
          { name: "AC Gas Filling", slug: "ac-gas-filling", description: "Top-up or full refill of AC refrigerant gas.", pricePaise: 299900, durationMinutes: 90, tags: ["ac", "gas"], unit: "unit" },
        ],
      },
      {
        name: "RO Technician",
        slug: "ro-technician",
        services: [
          { name: "RO Service", slug: "ro-service", description: "Periodic RO service: filter check, sanitisation and TDS calibration.", pricePaise: 39900, durationMinutes: 45, tags: ["ro", "service"], unit: "unit" },
          { name: "RO Filter Replacement", slug: "ro-filter-replacement", description: "Replace sediment, carbon or membrane filters.", pricePaise: 49900, durationMinutes: 45, tags: ["ro", "filter"], unit: "unit" },
          { name: "RO Installation", slug: "ro-installation", description: "Wall-mount installation and commissioning of a new RO unit.", pricePaise: 59900, durationMinutes: 60, tags: ["ro", "install"], unit: "unit" },
        ],
      },
    ],
  },

  // ─── 2. Beauty & Wellness — salon at home ──────────────────────────────────
  {
    name: "Beauty & Wellness",
    slug: "beauty-wellness",
    tagline: "Salon, spa and bridal services at home",
    icon: "💄",
    sortOrder: 2,
    archetype: "A",
    unit: "visit",
    basePricePaise: 29900,
    durationMinutes: 60,
    subCategories: [
      {
        name: "Facial & Cleanup",
        slug: "facial-and-cleanup",
        services: [
          { name: "Face Cleanup", slug: "face-cleanup", description: "Blackhead removal, deep-pore cleaning and a light scrub.", pricePaise: 39900, durationMinutes: 45, tags: ["facial", "cleanup"] },
          { name: "Basic Facial", slug: "basic-facial", description: "Hydration facial with a soothing cream massage.", pricePaise: 59900, durationMinutes: 60, tags: ["facial"] },
          { name: "Gold Facial", slug: "gold-facial", description: "Premium gold facial for glow and bridal shine.", pricePaise: 99900, durationMinutes: 60, tags: ["gold", "facial", "glow"] },
          { name: "Diamond Facial", slug: "diamond-facial", description: "Skin-polishing facial with real diamond-dust particles.", pricePaise: 149900, durationMinutes: 75, tags: ["diamond", "facial"] },
        ],
      },
      {
        name: "Waxing & Threading",
        slug: "waxing-and-threading",
        services: [
          { name: "Full Arms Waxing", slug: "full-arms-waxing", description: "Full-arm waxing with normal or premium wax.", pricePaise: 39900, durationMinutes: 30, tags: ["waxing", "arms"] },
          { name: "Full Legs Waxing", slug: "full-legs-waxing", description: "Full-leg waxing with normal or premium wax.", pricePaise: 49900, durationMinutes: 40, tags: ["waxing", "legs"] },
          { name: "Eyebrow Threading", slug: "eyebrow-threading", description: "Precise eyebrow and upper-lip threading.", pricePaise: 7900, durationMinutes: 15, tags: ["threading", "eyebrow"] },
        ],
      },
      {
        name: "Hair Services",
        slug: "hair-services",
        services: [
          { name: "Hair Cut & Styling", slug: "hair-cut-styling", description: "Hair cut, trim and blow-dry styling at home.", pricePaise: 29900, durationMinutes: 45, tags: ["hair", "cut"] },
          { name: "Hair Spa", slug: "hair-spa", description: "Nourishing hair spa for shine and scalp health.", pricePaise: 99900, durationMinutes: 60, tags: ["hair", "spa"] },
          { name: "Hair Colour", slug: "hair-colour", description: "Global hair colour or root touch-up.", pricePaise: 99900, durationMinutes: 90, tags: ["hair", "colour"] },
        ],
      },
      {
        name: "Manicure & Pedicure",
        slug: "manicure-and-pedicure",
        services: [
          { name: "Classic Manicure", slug: "classic-manicure", description: "Nail shaping, cuticle care and hand massage.", pricePaise: 39900, durationMinutes: 45, tags: ["manicure", "nails"] },
          { name: "Spa Pedicure", slug: "spa-pedicure", description: "Foot soak, scrub, callus care and massage.", pricePaise: 79900, durationMinutes: 60, tags: ["pedicure", "spa"] },
        ],
      },
      {
        name: "Makeup",
        slug: "makeup",
        services: [
          { name: "Party Makeup", slug: "party-makeup", description: "Occasion makeup with hairstyling and draping.", pricePaise: 299900, durationMinutes: 90, tags: ["makeup", "party"] },
          { name: "Bridal Makeup", slug: "bridal-makeup", description: "Complete HD/airbrush bridal makeup package.", pricePaise: 999900, durationMinutes: 180, tags: ["makeup", "bridal"] },
        ],
      },
    ],
  },

  // ─── 3. Home Services — cleaning, pest, laundry & care ─────────────────────
  {
    name: "Home Services",
    slug: "home-services",
    tagline: "Cleaning, pest control, laundry and home care on demand",
    icon: "🧹",
    sortOrder: 3,
    archetype: "A",
    unit: "visit",
    basePricePaise: 49900,
    durationMinutes: 120,
    subCategories: [
      {
        name: "Home Cleaning",
        slug: "home-cleaning",
        services: [
          { name: "Basic Home Cleaning", slug: "basic-home-cleaning", description: "Dusting, sweeping, mopping and surface cleaning of your home.", pricePaise: 99900, durationMinutes: 120, tags: ["cleaning", "home"] },
          { name: "Deep Home Cleaning", slug: "deep-home-cleaning", description: "Intensive top-to-bottom deep clean for the whole home.", pricePaise: 249900, durationMinutes: 240, tags: ["cleaning", "deep"] },
          { name: "Bathroom Deep Cleaning", slug: "bathroom-deep-cleaning", description: "Descaling, sanitising and stain removal for bathrooms.", pricePaise: 59900, durationMinutes: 60, tags: ["cleaning", "bathroom"] },
          { name: "Kitchen Deep Cleaning", slug: "kitchen-deep-cleaning", description: "Degreasing of chimney, slabs, tiles and appliances.", pricePaise: 99900, durationMinutes: 120, tags: ["cleaning", "kitchen"] },
        ],
      },
      {
        name: "Sofa & Carpet Cleaning",
        slug: "sofa-carpet-cleaning",
        services: [
          { name: "Sofa Shampooing", slug: "sofa-shampooing", description: "Deep shampoo and vacuum extraction of fabric sofas.", pricePaise: 99900, durationMinutes: 90, tags: ["sofa", "cleaning"] },
          { name: "Carpet Cleaning", slug: "carpet-cleaning", description: "Shampoo cleaning and drying of carpets and rugs.", pricePaise: 79900, durationMinutes: 60, tags: ["carpet", "cleaning"] },
          { name: "Mattress Cleaning", slug: "mattress-cleaning", description: "Deep cleaning and sanitisation of mattresses.", pricePaise: 69900, durationMinutes: 60, tags: ["mattress", "cleaning"] },
        ],
      },
      {
        name: "Pest Control",
        slug: "pest-control",
        services: [
          { name: "General Pest Control", slug: "general-pest-control", description: "Spray treatment for cockroaches, ants and common pests.", pricePaise: 99900, durationMinutes: 60, tags: ["pest", "control"] },
          { name: "Cockroach Control", slug: "cockroach-control", description: "Gel and spray treatment targeting cockroach infestations.", pricePaise: 79900, durationMinutes: 45, tags: ["pest", "cockroach"] },
          { name: "Termite Control", slug: "termite-control", description: "Drilling and chemical barrier treatment for termites.", pricePaise: 249900, durationMinutes: 120, tags: ["pest", "termite"] },
          { name: "Bed Bug Control", slug: "bed-bug-control", description: "Targeted treatment to eliminate bed bugs.", pricePaise: 149900, durationMinutes: 90, tags: ["pest", "bedbug"] },
        ],
      },
      {
        name: "Laundry",
        slug: "laundry",
        services: [
          { name: "Wash & Fold", slug: "wash-and-fold", description: "Pickup, machine wash, dry and fold of everyday clothes.", pricePaise: 49900, durationMinutes: 60, tags: ["laundry", "wash"], unit: "job" },
          { name: "Dry Cleaning", slug: "dry-cleaning", description: "Professional dry cleaning for delicate and formal wear.", pricePaise: 79900, durationMinutes: 60, tags: ["laundry", "dryclean"], unit: "job" },
          { name: "Steam Ironing", slug: "steam-ironing", description: "Steam press and ironing service for your wardrobe.", pricePaise: 39900, durationMinutes: 45, tags: ["laundry", "iron"], unit: "job" },
        ],
      },
      {
        name: "Gardening",
        slug: "gardening",
        services: [
          { name: "Garden Cleaning", slug: "garden-cleaning", description: "Weeding, leaf clearing and general garden tidy-up.", pricePaise: 69900, durationMinutes: 90, tags: ["garden", "cleaning"] },
          { name: "Lawn Mowing", slug: "lawn-mowing", description: "Mowing, edging and trimming of lawns.", pricePaise: 59900, durationMinutes: 60, tags: ["lawn", "mowing"] },
        ],
      },
    ],
  },

  // ─── 4. Pet Services — grooming, vet & care ────────────────────────────────
  {
    name: "Pet Services",
    slug: "pet-services",
    tagline: "Grooming, vet visits, walking and boarding for your pet",
    icon: "🐾",
    sortOrder: 4,
    archetype: "A",
    unit: "visit",
    basePricePaise: 29900,
    durationMinutes: 60,
    subCategories: [
      {
        name: "Pet Grooming",
        slug: "pet-grooming",
        services: [
          { name: "Dog Grooming", slug: "dog-grooming", description: "Bath, blow-dry, brushing and hair trim for dogs.", pricePaise: 79900, durationMinutes: 90, tags: ["pet", "dog", "grooming"] },
          { name: "Cat Grooming", slug: "cat-grooming", description: "Gentle bath, de-shedding and grooming for cats.", pricePaise: 69900, durationMinutes: 75, tags: ["pet", "cat", "grooming"] },
          { name: "Bath & Spa", slug: "pet-bath-spa", description: "Shampoo bath, conditioning and spa for pets.", pricePaise: 59900, durationMinutes: 60, tags: ["pet", "bath", "spa"] },
          { name: "Nail Clipping & Ear Cleaning", slug: "nail-clipping-ear-cleaning", description: "Nail trim, paw care and ear cleaning.", pricePaise: 29900, durationMinutes: 30, tags: ["pet", "nails", "ears"] },
        ],
      },
      {
        name: "Veterinary",
        slug: "veterinary",
        services: [
          { name: "General Check-up", slug: "vet-general-checkup", description: "At-home veterinary health check and consultation.", pricePaise: 49900, durationMinutes: 45, tags: ["pet", "vet", "checkup"] },
          { name: "Vaccination", slug: "vet-vaccination", description: "Scheduled vaccination administered at home.", pricePaise: 69900, durationMinutes: 30, tags: ["pet", "vet", "vaccine"] },
          { name: "Deworming", slug: "vet-deworming", description: "Deworming treatment and dosage guidance.", pricePaise: 39900, durationMinutes: 30, tags: ["pet", "vet", "deworm"] },
        ],
      },
      {
        name: "Pet Walking & Boarding",
        slug: "pet-walking-boarding",
        services: [
          { name: "Dog Walking", slug: "dog-walking", description: "Daily supervised dog-walking session.", pricePaise: 29900, durationMinutes: 45, tags: ["pet", "dog", "walking"] },
          { name: "Pet Day Care", slug: "pet-day-care", description: "Day-care supervision and play for your pet.", pricePaise: 39900, durationMinutes: 480, tags: ["pet", "daycare"] },
          { name: "Pet Boarding", slug: "pet-boarding", description: "Overnight boarding with feeding and care.", pricePaise: 69900, durationMinutes: 1440, tags: ["pet", "boarding"], unit: "day" },
        ],
      },
    ],
  },
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type BuiltServiceRow = {
  categorySlug: string;
  categoryName: string;
  subCategorySlug: string;
  subCategoryName: string;
  name: string;
  slug: string;
  archetype: string;
  unit: string;
  pricePaise: number;
  durationMinutes: number;
  tags: string[];
  description: string;
};

export function buildCatalogServices(): BuiltServiceRow[] {
  const rows: BuiltServiceRow[] = [];

  for (const cat of SERVICE_CATALOG) {
    for (const sub of cat.subCategories) {
      for (const svc of sub.services) {
        rows.push({
          categorySlug: cat.slug,
          categoryName: cat.name,
          subCategorySlug: sub.slug,
          subCategoryName: sub.name,
          name: svc.name,
          slug: svc.slug,
          archetype: svc.archetype ?? cat.archetype,
          unit: svc.unit ?? cat.unit,
          pricePaise: svc.pricePaise,
          durationMinutes: svc.durationMinutes,
          tags: [
            cat.slug,
            cat.name.toLowerCase(),
            sub.slug,
            sub.name.toLowerCase(),
            svc.slug,
            ...svc.name.toLowerCase().split(/\s+/),
            ...(svc.tags ?? []),
          ],
          description: svc.description,
        });
      }
    }
  }

  return rows;
}
