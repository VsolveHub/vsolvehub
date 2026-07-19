const SERVICE_BULLETS: Record<string, string[]> = {
  "deep-home-cleaning": [
    "6-step intensive process",
    "Inclusive of appliances & toilets"
  ],
  "basic-home-cleaning": [
    "Dusting, sweeping & mopping",
    "Eco-friendly cleaning agents used"
  ],
  "bathroom-deep-cleaning": [
    "Hard water stain removal",
    "Sanitisation & anti-fungal treatment"
  ],
  "kitchen-deep-cleaning": [
    "Degreasing of chimney & slabs",
    "Cabinet cleaning inside-out"
  ],
  "sofa-shampooing": [
    "Industrial shampooing & vacuuming",
    "Fabric conditioning & stain removal"
  ],
  "carpet-cleaning": [
    "Deep extraction wash",
    "Softening treatment"
  ],
  "mattress-cleaning": [
    "Dust-mite elimination",
    "UV sanitisation & deodorising"
  ],
  "general-pest-control": [
    "Odourless gel treatment",
    "Covers cockroaches, ants & silverfish"
  ],
  "cockroach-control": [
    "Targeted kitchen gel application",
    "Safe for kids and pets"
  ],
  "termite-control": [
    "Drill-Fill-Seal barrier technology",
    "1-year warranty on treated areas"
  ],
  "bed-bug-control": [
    "2-visit intensive spray treatment",
    "Immediate relief from bites"
  ],
  "wash-and-fold": [
    "Premium detergent wash",
    "Neatly folded & packed"
  ],
  "dry-cleaning": [
    "Stain removal pre-treatment",
    "Premium hanger packaging"
  ],
  "steam-ironing": [
    "Crisp crease steam press",
    "Hanger/fold option available"
  ]
};

export function getServiceBullets(slug: string, description: string): string[] {
  if (SERVICE_BULLETS[slug]) return SERVICE_BULLETS[slug];
  const parts = description.split(/[.,;]/).map(s => s.trim()).filter(s => s.length > 10);
  if (parts.length >= 2) return parts.slice(0, 2);
  return ["Expert professional service", "100% verified partners"];
}

const SERVICE_IMAGES: Record<string, string> = {
  "deep-home-cleaning": "/basic_home_cleaning_hd.jpg",
  "deep-cleaning": "/basic_home_cleaning_hd.jpg",
  "basic-home-cleaning": "/home_cleaner_hd.jpg",
  "bathroom-deep-cleaning": "/bathroom_deep_cleaning_hd.jpg",
  "kitchen-deep-cleaning": "/appliance_hd.jpg",
  "sofa-shampooing": "/basic_home_cleaning_hd.jpg",
  "carpet-cleaning": "/basic_home_cleaning_hd.jpg",
  "mattress-cleaning": "/basic_home_cleaning_hd.jpg",
  "general-pest-control": "/basic_home_cleaning_hd.jpg",
  "cockroach-control": "/basic_home_cleaning_hd.jpg",
  "termite-control": "/basic_home_cleaning_hd.jpg",
  "bed-bug-control": "/basic_home_cleaning_hd.jpg",
  "ac-deep-cleaning": "/ac_deep_cleaning_hd.jpg",
  "ac-general-service": "/ac_general_service_hd.jpg",
  "split-ac-installation": "/ac_technician_hd.jpg",
  "ac-gas-filling": "/ac_gas_filling_hd.jpg",
  "tap-repair": "/basin_sink_installation_hd.jpg",
  "drain-block-removal": "/basin_sink_installation_hd.jpg",
  "wc-flush-repair": "/basin_sink_installation_hd.jpg",
  "basin-sink-installation": "/basin_sink_installation_hd.jpg",
};

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  technician: "/ac_technician_hd.jpg",
  "beauty-wellness": "/beauty_hd.jpg",
  "pet-services": "/pet_hd.jpg",
};

export function getServiceImage(slug: string, categorySlug: string): string {
  return SERVICE_IMAGES[slug] ?? CATEGORY_FALLBACK_IMAGES[categorySlug] ?? "/basic_home_cleaning_hd.jpg";
}
