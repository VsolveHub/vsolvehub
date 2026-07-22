"use server";

// Mid-job parts: the technician can request extra products for the job at
// hand, but ONLY from the catalog slice mapped to the booking's service, and
// always at the platform price — there is no price input anywhere in this
// flow. Requests sit PENDING_APPROVAL until the customer approves them in
// their booking tracker.

import { prisma, getProductsForService, priceProductLine, type PublicProduct } from "@vsolve/db";
import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/auth";

export type PartLine = {
  id: string;
  name: string;
  qty: number;
  unitPricePaise: number;
  totalPaise: number;
  status: "APPROVED" | "PENDING_APPROVAL" | "DECLINED";
  addedBy: "CUSTOMER" | "PARTNER";
};

export type PartsData = {
  ok: boolean;
  error?: string;
  products: PublicProduct[];
  items: PartLine[];
};

/** The booking must be this partner's live STARTED job. */
async function requireOwnStartedBooking(bookingId: string) {
  const partner = await requirePartner();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, bookingRef: true, serviceId: true, status: true, assignedPartnerId: true, service: { select: { name: true } } },
  });
  if (!booking || booking.assignedPartnerId !== partner.id) {
    return { error: "This job is not assigned to you." as const };
  }
  if (booking.status !== "STARTED") {
    return { error: "Parts can only be added while the job is in progress." as const };
  }
  return { partner, booking };
}

export async function getPartsData(bookingId: string): Promise<PartsData> {
  const ctx = await requireOwnStartedBooking(bookingId);
  if ("error" in ctx) return { ok: false, error: ctx.error, products: [], items: [] };

  const [products, items] = await Promise.all([
    getProductsForService(prisma, ctx.booking.serviceId),
    prisma.bookingProductItem.findMany({
      where: { bookingId },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    ok: true,
    products,
    items: items.map((i) => ({
      id: i.id,
      name: i.product.name,
      qty: i.qty,
      unitPricePaise: i.unitPricePaise,
      totalPaise: i.totalPaise,
      status: i.status,
      addedBy: i.addedBy,
    })),
  };
}

export type RequestPartsResult = { ok: boolean; error?: string };

export async function requestPartsAction(
  bookingId: string,
  lines: { productId: string; qty: number }[],
): Promise<RequestPartsResult> {
  const ctx = await requireOwnStartedBooking(bookingId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const clean = lines.filter((l) => Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 99);
  if (clean.length === 0) return { ok: false, error: "Pick at least one part." };

  // Visibility filter: reject anything not mapped to this booking's service.
  const mapped = await getProductsForService(prisma, ctx.booking.serviceId);
  const mappedById = new Map(mapped.map((p) => [p.id, p]));

  const priced: { productId: string; qty: number; unitPricePaise: number; gstPaise: number; totalPaise: number; name: string }[] = [];
  for (const line of clean) {
    const product = mappedById.get(line.productId);
    if (!product) return { ok: false, error: "A selected part isn't available for this service." };
    if (product.stockQty < line.qty) return { ok: false, error: `"${product.name}" is out of stock.` };
    priced.push({ productId: product.id, qty: line.qty, name: product.name, ...priceProductLine(product, line.qty) });
  }

  const totalPaise = priced.reduce((s, l) => s + l.totalPaise, 0);
  const summary = priced.map((l) => `${l.name} ×${l.qty}`).join(", ");
  const itemized = priced
    .map((l) => `${l.name} ×${l.qty} (₹${(l.totalPaise / 100).toLocaleString("en-IN")})`)
    .join(", ");

  await prisma.$transaction(async (tx) => {
    await tx.bookingProductItem.createMany({
      data: priced.map((l) => ({
        bookingId,
        productId: l.productId,
        qty: l.qty,
        unitPricePaise: l.unitPricePaise,
        gstPaise: l.gstPaise,
        totalPaise: l.totalPaise,
        addedBy: "PARTNER",
        addedByPartnerId: ctx.partner.id,
        status: "PENDING_APPROVAL",
      })),
    });
    // Feed the existing revised-quote pipeline: the customer's tracker shows a
    // "revised quote" approval card, and approval captures the delta against
    // the order. Accumulate in case the partner sends multiple requests.
    const current = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { revisedAmountPaise: true, revisedReason: true },
    });
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        revisedAmountPaise: (current.revisedAmountPaise ?? 0) + totalPaise,
        revisedReason: current.revisedReason
          ? `${current.revisedReason}; Extra parts: ${itemized}`
          : `Extra parts: ${itemized}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: ctx.booking.userId,
        type: "booking",
        title: "Approve extra parts",
        body: `Your professional needs ${summary} (₹${(totalPaise / 100).toLocaleString("en-IN")}) for ${ctx.booking.service.name}. Review and approve in the tracker.`,
        href: `/booking/track/${ctx.booking.bookingRef}`,
        tone: "warning",
        icon: "bell",
        bookingRef: ctx.booking.bookingRef,
      },
    });
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
