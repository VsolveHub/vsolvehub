// Product marketplace seed: categories, brands, products, and the
// service→product mappings that scope what customers and technicians see.
// Idempotent — everything upserts by slug/sku, mappings are wiped and rebuilt.
import type { PrismaClient } from "@prisma/client";

type SeedProduct = {
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: string; // ProductCategory slug
  brand?: string; // Brand slug
  mrpPaise: number;
  pricePaise: number;
  gstRatePct?: number;
  stockQty?: number;
  specs?: Record<string, string>;
};

const PRODUCT_CATEGORIES = [
  { slug: "electrical", name: "Electrical", icon: "⚡", sortOrder: 1 },
  { slug: "plumbing", name: "Plumbing", icon: "🚿", sortOrder: 2 },
  { slug: "ac-cooling", name: "AC & Cooling", icon: "❄️", sortOrder: 3 },
  { slug: "water-purifier", name: "Water Purifier", icon: "💧", sortOrder: 4 },
  { slug: "cleaning-supplies", name: "Cleaning Supplies", icon: "🧴", sortOrder: 5 },
  { slug: "hardware-tools", name: "Hardware & Tools", icon: "🔩", sortOrder: 6 },
];

const BRANDS = [
  { slug: "havells", name: "Havells" },
  { slug: "anchor", name: "Anchor by Panasonic" },
  { slug: "polycab", name: "Polycab" },
  { slug: "finolex", name: "Finolex" },
  { slug: "crompton", name: "Crompton" },
  { slug: "astral", name: "Astral" },
  { slug: "ashirvad", name: "Ashirvad" },
  { slug: "jaquar", name: "Jaquar" },
  { slug: "kent", name: "Kent" },
  { slug: "eureka-forbes", name: "Eureka Forbes" },
  { slug: "vguard", name: "V-Guard" },
  { slug: "generic", name: "VSolve Essentials" },
];

const PRODUCTS: SeedProduct[] = [
  // ── Electrical ──
  { sku: "ELE-SW-001", name: "Modular Switch 6A (1-Way)", slug: "modular-switch-6a", description: "Polycarbonate 6A one-way modular switch, ISI marked.", category: "electrical", brand: "anchor", mrpPaise: 9900, pricePaise: 7500, stockQty: 200, specs: { Rating: "6A", Type: "1-Way" } },
  { sku: "ELE-SW-002", name: "Modular Switch 16A (Heavy Duty)", slug: "modular-switch-16a", description: "16A heavy-duty switch for geysers and ACs.", category: "electrical", brand: "havells", mrpPaise: 16900, pricePaise: 13900, stockQty: 150, specs: { Rating: "16A" } },
  { sku: "ELE-SK-001", name: "3-Pin Socket 6A", slug: "socket-6a-3pin", description: "Universal 3-pin 6A modular socket with shutter.", category: "electrical", brand: "anchor", mrpPaise: 12900, pricePaise: 9900, stockQty: 180, specs: { Rating: "6A" } },
  { sku: "ELE-SK-002", name: "Power Socket 16A", slug: "socket-16a", description: "16A power socket for heavy appliances.", category: "electrical", brand: "havells", mrpPaise: 19900, pricePaise: 15900, stockQty: 120, specs: { Rating: "16A" } },
  { sku: "ELE-MCB-001", name: "MCB 16A Single Pole", slug: "mcb-16a-sp", description: "C-curve 16A single-pole MCB, 10kA breaking capacity.", category: "electrical", brand: "havells", mrpPaise: 29900, pricePaise: 23900, stockQty: 100, specs: { Rating: "16A", Poles: "1" } },
  { sku: "ELE-MCB-002", name: "MCB 32A Double Pole", slug: "mcb-32a-dp", description: "C-curve 32A double-pole MCB for mains protection.", category: "electrical", brand: "polycab", mrpPaise: 59900, pricePaise: 47900, stockQty: 80, specs: { Rating: "32A", Poles: "2" } },
  { sku: "ELE-WR-001", name: "Copper Wire 1.5 sq mm (90m)", slug: "wire-1-5sqmm-90m", description: "FR-grade 1.5 sq mm copper wire coil, 90 metres.", category: "electrical", brand: "finolex", mrpPaise: 219900, pricePaise: 189900, stockQty: 40, specs: { Size: "1.5 sq mm", Length: "90m" } },
  { sku: "ELE-WR-002", name: "Copper Wire 2.5 sq mm (90m)", slug: "wire-2-5sqmm-90m", description: "FR-grade 2.5 sq mm copper wire coil, 90 metres.", category: "electrical", brand: "polycab", mrpPaise: 329900, pricePaise: 285900, stockQty: 35, specs: { Size: "2.5 sq mm", Length: "90m" } },
  { sku: "ELE-BLB-001", name: "LED Bulb 9W B22 (Cool White)", slug: "led-bulb-9w", description: "9W energy-saving LED bulb, 900 lumen, B22 base.", category: "electrical", brand: "crompton", mrpPaise: 14900, pricePaise: 9900, gstRatePct: 12, stockQty: 300, specs: { Wattage: "9W", Base: "B22" } },
  { sku: "ELE-TUB-001", name: "LED Batten 20W 4ft", slug: "led-batten-20w", description: "20W 4-foot LED tube light batten, cool daylight.", category: "electrical", brand: "crompton", mrpPaise: 44900, pricePaise: 34900, gstRatePct: 12, stockQty: 90, specs: { Wattage: "20W", Length: "4ft" } },
  { sku: "ELE-REG-001", name: "Fan Regulator (Step Type)", slug: "fan-regulator-step", description: "5-step modular fan speed regulator.", category: "electrical", brand: "anchor", mrpPaise: 34900, pricePaise: 27900, stockQty: 110, specs: { Steps: "5" } },
  { sku: "ELE-HLD-001", name: "Batten Lamp Holder", slug: "batten-lamp-holder", description: "Angle batten holder with brass contacts.", category: "electrical", brand: "generic", mrpPaise: 4900, pricePaise: 3500, stockQty: 250 },

  // ── Plumbing ──
  { sku: "PLM-TAP-001", name: "Bib Tap / Bib Cock (Chrome)", slug: "bib-tap-chrome", description: "Quarter-turn chrome-plated brass bib cock.", category: "plumbing", brand: "jaquar", mrpPaise: 84900, pricePaise: 69900, stockQty: 60, specs: { Finish: "Chrome", Type: "Quarter turn" } },
  { sku: "PLM-TAP-002", name: "Pillar Tap for Basin", slug: "pillar-tap-basin", description: "Chrome pillar tap for wash basins, foam-flow aerator.", category: "plumbing", brand: "jaquar", mrpPaise: 99900, pricePaise: 82900, stockQty: 50 },
  { sku: "PLM-VLV-001", name: "Angle Valve (Brass)", slug: "angle-valve-brass", description: "Heavy brass angle valve for geyser/basin inlets.", category: "plumbing", brand: "jaquar", mrpPaise: 54900, pricePaise: 44900, stockQty: 90 },
  { sku: "PLM-PIP-001", name: "CPVC Pipe 3/4in (3m)", slug: "cpvc-pipe-34-3m", description: "3/4-inch CPVC hot/cold water pipe, 3-metre length.", category: "plumbing", brand: "ashirvad", mrpPaise: 32900, pricePaise: 26900, stockQty: 70, specs: { Size: "3/4 inch", Length: "3m" } },
  { sku: "PLM-CON-001", name: "Connection Pipe 18in (Braided)", slug: "connection-pipe-18in", description: "Stainless braided flexible connection pipe, 18 inch.", category: "plumbing", brand: "generic", mrpPaise: 24900, pricePaise: 18900, stockQty: 120 },
  { sku: "PLM-FLU-001", name: "Flush Valve (Dual Flush)", slug: "flush-valve-dual", description: "Dual-flush valve kit for concealed cisterns.", category: "plumbing", brand: "jaquar", mrpPaise: 149900, pricePaise: 124900, stockQty: 30 },
  { sku: "PLM-WST-001", name: "Basin Waste Coupling", slug: "basin-waste-coupling", description: "Full-thread chrome waste coupling for basins.", category: "plumbing", brand: "generic", mrpPaise: 19900, pricePaise: 14900, stockQty: 100 },
  { sku: "PLM-TAPE-01", name: "Teflon Tape (Pack of 5)", slug: "teflon-tape-5pack", description: "Thread-seal PTFE tape rolls, pack of five.", category: "plumbing", brand: "generic", mrpPaise: 9900, pricePaise: 6900, stockQty: 200 },

  // ── AC & Cooling ──
  { sku: "AC-STB-001", name: "AC Voltage Stabilizer 4kVA", slug: "ac-stabilizer-4kva", description: "4kVA stabilizer for split ACs up to 1.5 ton.", category: "ac-cooling", brand: "vguard", mrpPaise: 399900, pricePaise: 329900, stockQty: 25, specs: { Capacity: "4kVA" } },
  { sku: "AC-PIP-001", name: "Copper Pipe Set 3m (Insulated)", slug: "ac-copper-pipe-3m", description: "Pair coil copper piping with insulation, 3 metres.", category: "ac-cooling", brand: "generic", mrpPaise: 249900, pricePaise: 199900, stockQty: 30 },
  { sku: "AC-DRN-001", name: "AC Drain Pipe 5m", slug: "ac-drain-pipe-5m", description: "Flexible condensate drain hose, 5 metres.", category: "ac-cooling", brand: "generic", mrpPaise: 29900, pricePaise: 21900, stockQty: 80 },
  { sku: "AC-BRK-001", name: "AC Mounting Bracket (Pair)", slug: "ac-mounting-bracket", description: "Powder-coated outdoor-unit wall bracket pair.", category: "ac-cooling", brand: "generic", mrpPaise: 69900, pricePaise: 54900, stockQty: 45 },
  { sku: "AC-RMT-001", name: "Universal AC Remote", slug: "universal-ac-remote", description: "Universal remote compatible with 1000+ AC models.", category: "ac-cooling", brand: "generic", mrpPaise: 49900, pricePaise: 34900, stockQty: 60 },

  // ── Water purifier ──
  { sku: "RO-FLT-001", name: "RO Sediment Filter (Spun)", slug: "ro-sediment-filter", description: "10-inch spun sediment pre-filter for RO systems.", category: "water-purifier", brand: "kent", mrpPaise: 29900, pricePaise: 19900, stockQty: 100 },
  { sku: "RO-FLT-002", name: "RO Carbon Filter (CTO)", slug: "ro-carbon-filter", description: "Activated-carbon block filter, removes chlorine and odour.", category: "water-purifier", brand: "kent", mrpPaise: 39900, pricePaise: 27900, stockQty: 90 },
  { sku: "RO-MEM-001", name: "RO Membrane 80 GPD", slug: "ro-membrane-80gpd", description: "80-GPD reverse-osmosis membrane, up to 2000 TDS.", category: "water-purifier", brand: "eureka-forbes", mrpPaise: 149900, pricePaise: 109900, stockQty: 40 },
  { sku: "RO-KIT-001", name: "RO Service Kit (1 Year)", slug: "ro-service-kit", description: "Complete annual filter-change kit: sediment + carbon + post-carbon.", category: "water-purifier", brand: "kent", mrpPaise: 199900, pricePaise: 149900, stockQty: 35 },

  // ── Cleaning supplies ──
  { sku: "CLN-FLR-001", name: "Floor Cleaner 5L (Citrus)", slug: "floor-cleaner-5l", description: "Disinfectant surface cleaner concentrate, 5 litres.", category: "cleaning-supplies", brand: "generic", mrpPaise: 74900, pricePaise: 59900, stockQty: 50 },
  { sku: "CLN-BTH-001", name: "Bathroom Cleaner 1L", slug: "bathroom-cleaner-1l", description: "Acid-based tile and sanitaryware descaler, 1 litre.", category: "cleaning-supplies", brand: "generic", mrpPaise: 24900, pricePaise: 18900, stockQty: 100 },
  { sku: "CLN-MFC-001", name: "Microfibre Cloths (Pack of 6)", slug: "microfibre-cloth-6pack", description: "340 GSM lint-free microfibre cloths, pack of six.", category: "cleaning-supplies", brand: "generic", mrpPaise: 39900, pricePaise: 29900, stockQty: 80 },
  { sku: "CLN-SCR-001", name: "Scrub Pads Heavy Duty (Pack of 10)", slug: "scrub-pads-10pack", description: "Heavy-duty non-rusting scrub pads, pack of ten.", category: "cleaning-supplies", brand: "generic", mrpPaise: 19900, pricePaise: 13900, stockQty: 150 },

  // ── Hardware & tools ──
  { sku: "HRD-HNG-001", name: "SS Door Hinges 4in (Pair)", slug: "ss-door-hinges-4in", description: "Stainless-steel 4-inch ball-bearing hinges, pair.", category: "hardware-tools", brand: "generic", mrpPaise: 29900, pricePaise: 22900, stockQty: 70 },
  { sku: "HRD-LCK-001", name: "Mortise Door Lock Set", slug: "mortise-door-lock", description: "6-lever mortise lock body with handles and keys.", category: "hardware-tools", brand: "generic", mrpPaise: 129900, pricePaise: 99900, stockQty: 40 },
  { sku: "HRD-CHN-001", name: "Drawer Channel 18in (Pair)", slug: "drawer-channel-18in", description: "Telescopic soft-close drawer channels, 18-inch pair.", category: "hardware-tools", brand: "generic", mrpPaise: 49900, pricePaise: 37900, stockQty: 55 },
];

/**
 * Subcategory-level mappings: every service in the subcategory sees these
 * products (in the booking add-on step, the technician's parts picker, and
 * service-page recommendations). Slugs reference seed-lib/service-catalog.ts.
 */
const SUBCATEGORY_MAPPINGS: Record<string, { sku: string; featured?: boolean }[]> = {
  electrician: [
    { sku: "ELE-SW-001", featured: true },
    { sku: "ELE-SW-002" },
    { sku: "ELE-SK-001", featured: true },
    { sku: "ELE-SK-002" },
    { sku: "ELE-MCB-001", featured: true },
    { sku: "ELE-MCB-002" },
    { sku: "ELE-WR-001" },
    { sku: "ELE-WR-002" },
    { sku: "ELE-BLB-001", featured: true },
    { sku: "ELE-TUB-001" },
    { sku: "ELE-REG-001" },
    { sku: "ELE-HLD-001" },
  ],
  plumber: [
    { sku: "PLM-TAP-001", featured: true },
    { sku: "PLM-TAP-002" },
    { sku: "PLM-VLV-001", featured: true },
    { sku: "PLM-PIP-001" },
    { sku: "PLM-CON-001" },
    { sku: "PLM-FLU-001" },
    { sku: "PLM-WST-001" },
    { sku: "PLM-TAPE-01" },
  ],
  "ac-technician": [
    { sku: "AC-STB-001", featured: true },
    { sku: "AC-PIP-001" },
    { sku: "AC-DRN-001" },
    { sku: "AC-BRK-001" },
    { sku: "AC-RMT-001" },
  ],
  "ro-technician": [
    { sku: "RO-FLT-001", featured: true },
    { sku: "RO-FLT-002" },
    { sku: "RO-MEM-001" },
    { sku: "RO-KIT-001", featured: true },
  ],
  "home-cleaning": [
    { sku: "CLN-FLR-001", featured: true },
    { sku: "CLN-BTH-001" },
    { sku: "CLN-MFC-001" },
    { sku: "CLN-SCR-001" },
  ],
  carpenter: [
    { sku: "HRD-HNG-001", featured: true },
    { sku: "HRD-LCK-001" },
    { sku: "HRD-CHN-001" },
  ],
};

/** Service-level mappings for extra precision on top of the subcategory sets. */
const SERVICE_MAPPINGS: Record<string, { sku: string; featured?: boolean }[]> = {
  // WC/flush repair specifically surfaces the flush valve first.
  "wc-flush-repair": [{ sku: "PLM-FLU-001", featured: true }],
  // Light installation leads with bulbs and battens.
  "light-led-installation": [
    { sku: "ELE-BLB-001", featured: true },
    { sku: "ELE-TUB-001", featured: true },
  ],
};

export async function seedProducts(prisma: PrismaClient) {
  for (const c of PRODUCT_CATEGORIES) {
    await prisma.productCategory.upsert({ where: { slug: c.slug }, update: c, create: c });
  }
  for (const b of BRANDS) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: b, create: b });
  }

  const categories = await prisma.productCategory.findMany();
  const brands = await prisma.brand.findMany();
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const brandBySlug = new Map(brands.map((b) => [b.slug, b.id]));

  for (const p of PRODUCTS) {
    const data = {
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      description: p.description,
      productCategoryId: catBySlug.get(p.category)!,
      brandId: p.brand ? (brandBySlug.get(p.brand) ?? null) : null,
      mrpPaise: p.mrpPaise,
      pricePaise: p.pricePaise,
      gstRatePct: p.gstRatePct ?? 18,
      specs: JSON.stringify(p.specs ?? {}),
      isActive: true,
    };
    await prisma.product.upsert({
      where: { sku: p.sku },
      // Stock is only set on create so a re-seed never clobbers live inventory.
      update: data,
      create: { ...data, stockQty: p.stockQty ?? 50 },
    });
  }

  const products = await prisma.product.findMany({ select: { id: true, sku: true } });
  const productBySku = new Map(products.map((p) => [p.sku, p.id]));

  // Rebuild mappings from the definitions above (idempotent).
  await prisma.serviceProductMap.deleteMany({});

  const subCategories = await prisma.serviceSubCategory.findMany({ select: { id: true, slug: true } });
  const subBySlug = new Map(subCategories.map((s) => [s.slug, s.id]));
  for (const [subSlug, items] of Object.entries(SUBCATEGORY_MAPPINGS)) {
    const subCategoryId = subBySlug.get(subSlug);
    if (!subCategoryId) continue;
    let sort = 0;
    for (const item of items) {
      const productId = productBySku.get(item.sku);
      if (!productId) continue;
      await prisma.serviceProductMap.create({
        data: { productId, subCategoryId, sortOrder: sort++, featured: item.featured ?? false },
      });
    }
  }

  const allServices = await prisma.service.findMany({ select: { id: true, slug: true } });
  const serviceBySlug = new Map(allServices.map((s) => [s.slug, s.id]));
  for (const [svcSlug, items] of Object.entries(SERVICE_MAPPINGS)) {
    const serviceId = serviceBySlug.get(svcSlug);
    if (!serviceId) continue;
    let sort = 0;
    for (const item of items) {
      const productId = productBySku.get(item.sku);
      if (!productId) continue;
      await prisma.serviceProductMap.create({
        data: { productId, serviceId, sortOrder: sort++, featured: item.featured ?? false },
      });
    }
  }

  console.log(
    `Seeded ${PRODUCT_CATEGORIES.length} product categories, ${BRANDS.length} brands, ${PRODUCTS.length} products with service mappings.`,
  );
}
