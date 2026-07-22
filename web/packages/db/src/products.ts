// ─────────────────────────────────────────────────────────────────────────────
// Product catalog helpers shared by the customer app (booking add-ons, /store),
// the partner app (mid-job parts picker) and the admin panel.
//
// Pricing contract: Product.pricePaise is the CUSTOMER-FACING unit price,
// GST-inclusive. gstRatePct records the rate so invoices can show the included
// tax portion (computed, never stored on the product). Every booking/order line
// snapshots unitPricePaise + gstPaise + totalPaise at add time, so a later
// catalog edit can never mutate a live cart or an issued invoice.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrismaClient, Prisma, Product } from "@prisma/client";

/** Serializable product shape sent to clients (specs/images parsed). */
export type PublicProduct = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  brandName: string | null;
  categoryName: string;
  categorySlug: string;
  images: string[];
  mrpPaise: number;
  pricePaise: number;
  gstRatePct: number;
  inStock: boolean;
  stockQty: number;
  specs: Record<string, string>;
  featured?: boolean;
};

type ProductWithRels = Prisma.ProductGetPayload<{
  include: { brand: true; productCategory: true };
}>;

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v).filter(([, val]) => typeof val === "string"),
      ) as Record<string, string>;
    }
  } catch {
    /* corrupt specs — treat as none */
  }
  return {};
}

export function toPublicProduct(p: ProductWithRels, featured?: boolean): PublicProduct {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    description: p.description,
    brandName: p.brand?.name ?? null,
    categoryName: p.productCategory.name,
    categorySlug: p.productCategory.slug,
    images: parseJsonArray(p.images),
    mrpPaise: p.mrpPaise,
    pricePaise: p.pricePaise,
    gstRatePct: p.gstRatePct,
    inStock: p.stockQty > 0,
    stockQty: p.stockQty,
    specs: parseJsonObject(p.specs),
    featured,
  };
}

/**
 * Resolve the products mapped to a service: the union of service-level rows
 * and subcategory-level rows (deduped, service-level order first). This is THE
 * visibility filter — booking add-ons, the technician's parts picker, and
 * recommendations must all come through here so a plumbing job never shows
 * MCBs. Only active products are returned; callers decide how to treat
 * out-of-stock ones (shown but not addable).
 */
export async function getProductsForService(
  prisma: PrismaClient,
  serviceId: string,
): Promise<PublicProduct[]> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, subCategoryId: true },
  });
  if (!service) return [];

  const maps = await prisma.serviceProductMap.findMany({
    where: {
      OR: [
        { serviceId: service.id },
        ...(service.subCategoryId ? [{ subCategoryId: service.subCategoryId }] : []),
      ],
      product: { isActive: true },
    },
    include: { product: { include: { brand: true, productCategory: true } } },
    orderBy: [{ serviceId: "asc" }, { sortOrder: "asc" }],
  });

  const seen = new Set<string>();
  const out: PublicProduct[] = [];
  // Service-level mappings first so their sort/featured flags win the dedupe.
  const ordered = [...maps.filter((m) => m.serviceId), ...maps.filter((m) => !m.serviceId)];
  for (const m of ordered) {
    if (seen.has(m.productId)) continue;
    seen.add(m.productId);
    out.push(toPublicProduct(m.product, m.featured));
  }
  return out;
}

export type ProductLinePrice = {
  unitPricePaise: number;
  /** GST portion INCLUDED in totalPaise (price is tax-inclusive). */
  gstPaise: number;
  totalPaise: number;
};

/** Compute a snapshot line price from the catalog row. Server-side only. */
export function priceProductLine(
  product: Pick<Product, "pricePaise" | "gstRatePct">,
  qty: number,
): ProductLinePrice {
  const totalPaise = product.pricePaise * qty;
  const gstPaise = Math.round((totalPaise * product.gstRatePct) / (100 + product.gstRatePct));
  return { unitPricePaise: product.pricePaise, gstPaise, totalPaise };
}

/**
 * Atomically decrement stock for a set of lines; throws if any product has
 * insufficient stock (caller wraps in a transaction with the money move).
 */
export async function decrementStock(
  tx: Prisma.TransactionClient,
  lines: { productId: string; qty: number }[],
): Promise<void> {
  for (const line of lines) {
    const res = await tx.product.updateMany({
      where: { id: line.productId, stockQty: { gte: line.qty } },
      data: { stockQty: { decrement: line.qty } },
    });
    if (res.count === 0) {
      const p = await tx.product.findUnique({
        where: { id: line.productId },
        select: { name: true },
      });
      throw new Error(`"${p?.name ?? "Product"}" is out of stock`);
    }
  }
}
