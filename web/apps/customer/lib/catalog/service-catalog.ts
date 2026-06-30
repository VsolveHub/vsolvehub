/** VSolveHub service catalog — categories and sub-services (source of truth for seed). */

export type CatalogCategoryDef = {
  name: string;
  slug: string;
  tagline: string;
  icon: string;
  sortOrder: number;
  archetype: "A" | "B" | "C" | "D" | "E" | "F";
  unit: "visit" | "day" | "night" | "hour" | "job";
  basePricePaise: number;
  durationMinutes: number;
  subServices: string[];
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
    subServices: [
      "Electrical Services",
      "Plumbing Services",
      "Carpentry Services",
      "AC & RO Services",
      "Cleaning Services",
      "Painting Services",
      "Appliance Repair",
      "Home Automation",
    ],
  },
  {
    name: "Construction Services",
    slug: "construction-services",
    tagline: "Skilled labour and civil work for your building projects",
    icon: "👷",
    sortOrder: 2,
    archetype: "B",
    unit: "day",
    basePricePaise: 80000,
    durationMinutes: 480,
    subServices: [
      "General Labour",
      "Mason Work",
      "Welding & Fabrication",
      "Tile & Flooring Work",
      "Waterproofing",
      "Shuttering & Steel Work",
      "Demolition Work",
      "Civil & Road Work",
    ],
  },
  {
    name: "Beauty & Wellness",
    slug: "beauty-wellness",
    tagline: "Salon, spa and wellness services at home",
    icon: "💅",
    sortOrder: 3,
    archetype: "A",
    unit: "visit",
    basePricePaise: 99900,
    durationMinutes: 60,
    subServices: [
      "Facial & Skin Care",
      "Hair Services",
      "Waxing & Threading",
      "Makeup Services",
      "Mehendi Services",
      "Manicure & Pedicure",
      "Bridal Packages",
      "Body Care",
    ],
  },
  {
    name: "Event & Media Services",
    slug: "event-media-services",
    tagline: "Photography, catering, décor and full event support",
    icon: "📸",
    sortOrder: 4,
    archetype: "F",
    unit: "visit",
    basePricePaise: 499900,
    durationMinutes: 240,
    subServices: [
      "Photography",
      "Videography",
      "Decoration",
      "Catering",
      "DJ & Sound",
      "Event Planning",
      "Entertainment Services",
      "Editing & Album Services",
    ],
  },
  {
    name: "Rental Services",
    slug: "rental-services",
    tagline: "Furniture, equipment, vehicles and tools on rent",
    icon: "📦",
    sortOrder: 5,
    archetype: "C",
    unit: "day",
    basePricePaise: 99900,
    durationMinutes: 1440,
    subServices: [
      "Furniture Rental",
      "Event Equipment Rental",
      "Construction Equipment Rental",
      "Vehicle Rental",
      "Home Appliance Rental",
      "Camera Equipment Rental",
      "Tools & Machinery Rental",
      "Cooling & Heating Rental",
    ],
  },
  {
    name: "Vehicle Services",
    slug: "vehicle-services",
    tagline: "Rides, repairs, washing and roadside assistance",
    icon: "🚗",
    sortOrder: 6,
    archetype: "A",
    unit: "visit",
    basePricePaise: 29900,
    durationMinutes: 60,
    subServices: [
      "Ride Booking",
      "Taxi Services",
      "Goods Transport",
      "Vehicle Repair",
      "Vehicle Washing",
      "Roadside Assistance",
      "EV Services",
      "Vehicle Documents & Insurance",
    ],
  },
  {
    name: "Accommodation Services",
    slug: "accommodation-services",
    tagline: "Rooms, PG, hostels and short-stay options",
    icon: "🏨",
    sortOrder: 7,
    archetype: "D",
    unit: "night",
    basePricePaise: 99900,
    durationMinutes: 1440,
    subServices: [
      "Rooms",
      "PG Accommodation",
      "Hostels",
      "Apartments",
      "Rental Properties",
      "Short Stay",
      "Student Accommodation",
      "Worker Accommodation",
    ],
  },
  {
    name: "Job Opportunities",
    slug: "job-opportunities",
    tagline: "Find skilled, office, remote and field jobs",
    icon: "💼",
    sortOrder: 8,
    archetype: "E",
    unit: "job",
    basePricePaise: 0,
    durationMinutes: 0,
    subServices: [
      "Skilled Jobs",
      "Unskilled Jobs",
      "Technician Jobs",
      "Driver Jobs",
      "Office Jobs",
      "IT & Software Jobs",
      "Healthcare Jobs",
      "Work From Home Jobs",
    ],
  },
  {
    name: "Manpower & Support Staff",
    slug: "manpower-support-staff",
    tagline: "Hire cleaning, security, event and office support staff",
    icon: "👥",
    sortOrder: 9,
    archetype: "B",
    unit: "day",
    basePricePaise: 70000,
    durationMinutes: 480,
    subServices: [
      "Cleaning Staff",
      "Logistics Staff",
      "Event Staff",
      "Drivers",
      "Domestic Staff",
      "Security Staff",
      "Construction Support Staff",
      "Office Support Staff",
    ],
  },
  {
    name: "Custom / Other Services",
    slug: "custom-other-services",
    tagline: "Describe your need — we'll find the right professional",
    icon: "✨",
    sortOrder: 10,
    archetype: "A",
    unit: "visit",
    basePricePaise: 49900,
    durationMinutes: 60,
    subServices: [
      "Describe Your Requirement",
      "Emergency Services",
      "Consultation Services",
      "Custom Service Requests",
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
    for (const subName of cat.subServices) {
      const subSlug = slugify(subName);
      const slug = subSlug;
      rows.push({
        categorySlug: cat.slug,
        categoryName: cat.name,
        subCategorySlug: subSlug,
        subCategoryName: subName,
        name: subName,
        slug,
        archetype: cat.archetype,
        unit: cat.unit,
        pricePaise: cat.basePricePaise,
        durationMinutes: cat.durationMinutes,
        tags: [
          cat.slug,
          cat.name.toLowerCase(),
          subSlug,
          ...subName.toLowerCase().split(/\s+/),
        ],
        description:
          cat.archetype === "E"
            ? `${subName} — browse and apply for opportunities on V Solve Hub.`
            : cat.archetype === "B"
              ? `${subName} — book skilled ${cat.name.toLowerCase()} professionals by the day.`
              : `${subName} — book trusted professionals under ${cat.name} on V Solve Hub.`,
      });
    }
  }

  return rows;
}
