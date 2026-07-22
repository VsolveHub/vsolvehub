import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProductsForService, priceProductLine } from "@vsolve/db";
import { cartAddSchema } from "@/lib/validation/schemas";
import { resolveServiceArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";
import { createBooking } from "@/lib/bookings/queries";
import type { CartItem, CartLineItem } from "@/lib/cart/types";

function parseLineItems(raw: string): CartLineItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLineItem[]) : [];
  } catch {
    return [];
  }
}

type CartBooking = {
  id: string;
  bookingRef: string;
  serviceId: string;
  slot: string;
  scheduleType: string;
  addressId: string;
  quotedAmount: number;
  lineItems: string;
  archetypeDetails: string;
  service: { name: string; slug: string; category: { slug: string } };
  address: { label: string; fullAddress: string };
};

function toCartItem(b: CartBooking): CartItem {
  let detailsParsed = {};
  try {
    detailsParsed = JSON.parse(b.archetypeDetails || "{}");
  } catch {}
  return {
    id: b.id,
    bookingRef: b.bookingRef,
    serviceId: b.serviceId,
    serviceName: b.service.name,
    serviceSlug: b.service.slug,
    categorySlug: b.service.category.slug,
    slot: b.slot,
    scheduleType: b.scheduleType,
    addressId: b.addressId,
    addressLabel: b.address?.label ?? "",
    addressFull: b.address?.fullAddress ?? "",
    quotedAmount: b.quotedAmount,
    lineItems: parseLineItems(b.lineItems),
    archetypeDetails: detailsParsed,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = cartAddSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
    include: { category: true, subCategory: true }
  });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  // Resolve or create a default address
  let address = data.addressId
    ? await prisma.address.findFirst({ where: { id: data.addressId, userId: session.id } })
    : null;

  if (!address) {
    address = await prisma.address.findFirst({ where: { userId: session.id, isDefault: true } });
  }
  if (!address) {
    address = await prisma.address.findFirst({ where: { userId: session.id } });
  }
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: session.id,
        label: "Home",
        fullAddress: "Khajaguda, Hyderabad — 500032",
        lat: 17.385,
        lng: 78.4867,
        isDefault: true,
      },
    });
  }

  // Resolve scheduleType and slot placeholder
  const scheduleType = data.scheduleType ?? "scheduled";
  let slot = data.slot;
  if (!slot) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    slot = tomorrow.toISOString();
  }

  const archetype = resolveServiceArchetype(service.archetype);
  if (!usesPushDispatch(archetype)) {
    return NextResponse.json({ error: "This service can't be added to the cart" }, { status: 400 });
  }
  if (scheduleType === "scheduled" && new Date(slot).getTime() < Date.now() - 15 * 60 * 1000) {
    return NextResponse.json({ error: "Please choose a future time slot" }, { status: 400 });
  }

  const estimate = priceBooking({
    categorySlug: service.category.slug,
    subCategorySlug: service.subCategory?.slug,
    serviceSlug: service.slug,
    selections: coerceSelections(
      data.selections ?? (data.archetypeDetails as { fieldValues?: unknown } | undefined)?.fieldValues,
    ),
  });
  const serviceAmount = estimate.totalPaise > 0 ? estimate.totalPaise : service.pricePaise;

  // Product add-ons: only products mapped to THIS service are accepted, and
  // every line is priced from the catalog — client-sent prices don't exist.
  const productLines: {
    productId: string;
    qty: number;
    unitPricePaise: number;
    gstPaise: number;
    totalPaise: number;
    name: string;
  }[] = [];
  if (data.products && data.products.length > 0) {
    const mapped = await getProductsForService(prisma, service.id);
    const mappedById = new Map(mapped.map((p) => [p.id, p]));
    for (const req of data.products) {
      const product = mappedById.get(req.productId);
      if (!product) {
        return NextResponse.json(
          { error: "One of the selected products isn't available for this service" },
          { status: 400 },
        );
      }
      if (product.stockQty < req.qty) {
        return NextResponse.json({ error: `"${product.name}" is out of stock` }, { status: 409 });
      }
      const price = priceProductLine(product, req.qty);
      productLines.push({ productId: product.id, qty: req.qty, name: product.name, ...price });
    }
  }
  const productsTotal = productLines.reduce((s, l) => s + l.totalPaise, 0);
  const quotedAmount = serviceAmount + productsTotal;

  const booking = await createBooking({
    userId: session.id,
    serviceId: data.serviceId,
    addressId: address.id,
    slot,
    quotedAmount,
    baseChargePaise: estimate.basePaise > 0 ? estimate.basePaise : service.pricePaise,
    lineItems: [
      ...estimate.lineItems,
      // Product lines ride along in the display snapshot so the cart and the
      // invoice render them without extra queries; BookingProductItem rows
      // below are the transactional source of truth.
      ...productLines.map((l) => ({
        key: `product:${l.productId}`,
        label: "Product",
        value: l.name,
        qty: l.qty,
        unitPaise: l.unitPricePaise,
        totalPaise: l.totalPaise,
        kind: "product" as const,
      })),
    ],
    archetype,
    issueDescription: data.note,
    mediaUrls: data.mediaUrls,
    status: "DRAFT",
    paymentStatus: "PENDING",
    paymentMethod: null,
    scheduleType,
    vendorAssignmentMode: "auto",
    archetypeDetails: data.archetypeDetails ?? {},
  });

  if (productLines.length > 0) {
    await prisma.bookingProductItem.createMany({
      data: productLines.map((l) => ({
        bookingId: booking.id,
        productId: l.productId,
        qty: l.qty,
        unitPricePaise: l.unitPricePaise,
        gstPaise: l.gstPaise,
        totalPaise: l.totalPaise,
        addedBy: "CUSTOMER",
        status: "APPROVED",
        approvedAt: new Date(),
      })),
    });
  }

  return NextResponse.json({ item: toCartItem(booking) });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // The header CartBadge needs only the count, on every page. Serve it from a
  // cheap COUNT instead of the full findMany + joins + per-item JSON parse.
  if (req.nextUrl.searchParams.has("count")) {
    const count = await prisma.booking.count({ where: { userId: session.id, status: "DRAFT" } });
    return NextResponse.json({ count });
  }

  const rows = await prisma.booking.findMany({
    where: { userId: session.id, status: "DRAFT" },
    orderBy: { createdAt: "asc" },
    include: { service: { include: { category: true } }, address: true },
  });

  const items = rows.map(toCartItem);
  return NextResponse.json({ items, totalPaise: items.reduce((s, i) => s + i.quotedAmount, 0) });
}
