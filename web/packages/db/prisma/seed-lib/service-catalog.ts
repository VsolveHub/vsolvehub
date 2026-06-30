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
  {
    name: "Home Services",
    slug: "home-services",
    tagline: "Electricians, plumbers, cleaners and more at your doorstep",
    icon: "🏠",
    sortOrder: 1,
    archetype: "A",
    unit: "visit",
    basePricePaise: 49900,
    durationMinutes: 90,
    subCategories: [
      {
        name: "Electrician",
        slug: "electrician",
        services: [
          {
            name: "Switch Repair",
            slug: "switch-repair",
            description: "Repair faulty switches, modular switches, or traditional toggle switches.",
            pricePaise: 9900,
            durationMinutes: 30,
            tags: ["switch", "repair", "electrical", "wiring"],
          },
          {
            name: "Socket Repair",
            slug: "socket-repair",
            description: "Fix loose or sparked sockets, replacement of modular socket boards.",
            pricePaise: 9900,
            durationMinutes: 30,
            tags: ["socket", "repair", "electrical", "plug"],
          },
          {
            name: "Fan Repair",
            slug: "fan-repair",
            description: "Resolve noise issues, capacitor replacement, or wiring fixes for ceiling/table fans.",
            pricePaise: 9900,
            durationMinutes: 45,
            tags: ["fan", "repair", "regulator", "capacitor"],
          },
          {
            name: "Power Issue Check",
            slug: "power-issue-check",
            description: "Diagnosis of partial power failure, fuse issues, or MCB tripping issues.",
            pricePaise: 14900,
            durationMinutes: 60,
            tags: ["power", "failure", "mcb", "fuse", "check"],
          },
          {
            name: "Short Circuit Fix",
            slug: "short-circuit-fix",
            description: "Identify and resolve short circuits in house wiring, including replacement of burned wires.",
            pricePaise: 14900,
            durationMinutes: 90,
            tags: ["short-circuit", "sparking", "wire-burn", "repair"],
          },
          {
            name: "Fan Installation",
            slug: "fan-installation",
            description: "Assembly, mounting, and electrical connection of a new ceiling/wall fan.",
            pricePaise: 19900,
            durationMinutes: 60,
            tags: ["fan", "install", "new-fan", "mounting"],
          },
          {
            name: "Bulb / Tube Light Installation",
            slug: "bulb-tube-light-installation",
            description: "Installation of LED bulbs, tube lights, or decorative ceiling panel lights.",
            pricePaise: 14900,
            durationMinutes: 30,
            tags: ["light", "bulb", "tubelight", "install", "fixture"],
          },
        ],
      },
      {
        name: "Plumbing Services",
        slug: "plumbing-services",
        services: [
          {
            name: "Tap Repair & Leakage",
            slug: "tap-repair",
            description: "Fix leaking taps, pipe connections, or spindle replacements.",
            pricePaise: 9900,
            durationMinutes: 30,
          },
          {
            name: "Flush Tank Repair",
            slug: "flush-tank-repair",
            description: "Repair faulty flush valves, syphon replacements, or wall hung flush issues.",
            pricePaise: 19900,
            durationMinutes: 45,
          },
        ],
      },
      {
        name: "Carpentry Services",
        slug: "carpentry-services",
        services: [
          {
            name: "Door Lock Repair",
            slug: "door-lock-repair",
            description: "Fix handle lock, latch, or key rotation issues in main or bedroom doors.",
            pricePaise: 14900,
            durationMinutes: 40,
          },
        ],
      },
    ],
  },
  {
    name: "Beauty & Wellness",
    slug: "beauty-wellness",
    tagline: "Salon, spa and wellness services at home",
    icon: "💅",
    sortOrder: 2,
    archetype: "A",
    unit: "visit",
    basePricePaise: 99900,
    durationMinutes: 60,
    subCategories: [
      {
        name: "Face Care (Facial & Cleanup)",
        slug: "face-care-facial-and-cleanup",
        services: [
          {
            name: "Face Cleanup",
            slug: "face-cleanup",
            description: "Removal of blackheads, deep pore cleaning, and light scrub.",
            pricePaise: 49900,
            durationMinutes: 45,
          },
          {
            name: "Basic Facial",
            slug: "basic-facial",
            description: "Standard skin hydration facial with soothing cream massage.",
            pricePaise: 69900,
            durationMinutes: 60,
          },
          {
            name: "Fruit Facial",
            slug: "fruit-facial",
            description: "Natural fruit extract facial for instant refreshment and tan removal.",
            pricePaise: 79900,
            durationMinutes: 60,
          },
          {
            name: "Gold Facial",
            slug: "gold-facial",
            description: "Premium gold dust facial pack for glow, skin restoration, and bridal shine.",
            pricePaise: 99900,
            durationMinutes: 60,
            tags: ["gold", "facial", "makeup", "skin", "glow"],
          },
          {
            name: "Diamond Facial",
            slug: "diamond-facial",
            description: "Ultimate skin polishing facial utilizing real diamond dust particles.",
            pricePaise: 149900,
            durationMinutes: 75,
          },
          {
            name: "Hydrating Facial",
            slug: "hydrating-facial",
            description: "Intense moisture facial for dry and flaky skin types.",
            pricePaise: 89900,
            durationMinutes: 60,
          },
          {
            name: "Anti-Aging Facial",
            slug: "anti-aging-facial",
            description: "Collagen-rich facial targeting wrinkles, fine lines, and skin tightening.",
            pricePaise: 129900,
            durationMinutes: 90,
          },
        ],
      },
      {
        name: "Waxing & Threading",
        slug: "waxing-and-threading",
        services: [
          {
            name: "Eyebrow Threading",
            slug: "eyebrow-threading",
            description: "Precise threading for eyebrows and upper lip.",
            pricePaise: 9900,
            durationMinutes: 15,
          },
        ],
      },
    ],
  },
  {
    name: "Construction Services",
    slug: "construction-services",
    tagline: "Skilled labour and civil work for your building projects",
    icon: "👷",
    sortOrder: 3,
    archetype: "B",
    unit: "day",
    basePricePaise: 80000,
    durationMinutes: 480,
    subCategories: [
      {
        name: "General Labour",
        slug: "general-labour",
        services: [
          {
            name: "General Labour",
            slug: "general-labour",
            description: "Helpers for construction sites, loading/unloading materials, or site cleaning.",
            pricePaise: 50000,
            durationMinutes: 480,
          },
        ],
      },
      {
        name: "Mason Work",
        slug: "mason-work",
        services: [
          {
            name: "Mason Work",
            slug: "mason-work",
            description: "Skilled brick laying, plastering, concrete pouring, and stone masonry.",
            pricePaise: 80000,
            durationMinutes: 480,
            tags: ["mason", "brick", "plaster", "construction"],
          },
        ],
      },
      {
        name: "Bar Bending",
        slug: "bar-bending",
        services: [
          {
            name: "Bar Bending",
            slug: "bar-bending",
            description: "Cutting, bending, and fixing reinforcement steel bars for slabs and pillars.",
            pricePaise: 85000,
            durationMinutes: 480,
          },
        ],
      },
      {
        name: "Shuttering",
        slug: "shuttering",
        services: [
          {
            name: "Shuttering & Steel Work",
            slug: "shuttering",
            description: "Wooden formwork shuttering and steel reinforcement setup.",
            pricePaise: 90000,
            durationMinutes: 480,
          },
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
