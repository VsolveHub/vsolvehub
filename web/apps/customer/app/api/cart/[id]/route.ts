import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cartPatchSchema } from "@/lib/validation/schemas";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = cartPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id, userId: session.id, status: "DRAFT" },
    include: { service: { include: { category: true, subCategory: true } } },
  });
  if (!booking) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });

  if (data.addressId) {
    const owns = await prisma.address.findFirst({ where: { id: data.addressId, userId: session.id } });
    if (!owns) return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (data.slot) update.slot = data.slot;
  if (data.scheduleType) update.scheduleType = data.scheduleType;
  if (data.addressId) update.addressId = data.addressId;

  if (data.selections) {
    const estimate = priceBooking({
      categorySlug: booking.service.category.slug,
      subCategorySlug: booking.service.subCategory?.slug,
      serviceSlug: booking.service.slug,
      selections: coerceSelections(data.selections),
    });
    const quotedAmount = estimate.totalPaise > 0 ? estimate.totalPaise : booking.service.pricePaise;
    update.quotedAmount = quotedAmount;
    update.baseChargePaise = estimate.basePaise > 0 ? estimate.basePaise : booking.service.pricePaise;
    update.finalAmountPaise = quotedAmount;
    update.lineItems = JSON.stringify(estimate.lineItems);
  }

  const saved = await prisma.booking.update({ where: { id: booking.id }, data: update });
  return NextResponse.json({ ok: true, quotedAmount: saved.quotedAmount });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // Scoped to DRAFT + owner, so only a cart entry can ever be deleted here.
  await prisma.booking.deleteMany({ where: { id, userId: session.id, status: "DRAFT" } });
  return NextResponse.json({ ok: true });
}
