import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cartPatchSchema } from "@/lib/validation/schemas";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";
import { calculateServiceCommercials } from "@/lib/bookings/commercials";
import { findAvailablePartners } from "@/lib/fulfillment/matching";

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
  if (data.preferredPartnerId !== undefined) update.preferredPartnerId = data.preferredPartnerId;

  if (data.selections || data.durationMinutes) {
    const estimate = priceBooking({
      categorySlug: booking.service.category.slug,
      subCategorySlug: booking.service.subCategory?.slug,
      serviceSlug: booking.service.slug,
      selections: coerceSelections(data.selections),
    });
    const hourlyRate = estimate.totalPaise > 0 ? estimate.totalPaise : booking.service.pricePaise;
    const commercials = calculateServiceCommercials(
      hourlyRate,
      data.durationMinutes ?? booking.durationMinutes,
    );
    update.quotedAmount = commercials.totalPaise;
    update.baseChargePaise = commercials.serviceSubtotalPaise;
    update.platformFeePaise = commercials.platformFeePaise;
    update.taxPaise = commercials.platformFeeGstPaise;
    update.durationMinutes = commercials.durationMinutes;
    update.finalAmountPaise = commercials.totalPaise;
    if (data.selections) update.lineItems = JSON.stringify(estimate.lineItems);
  }

  // A slot is accepted only while at least one professional is genuinely
  // eligible. This is the customer-facing availability gate, before payment.
  if (data.slot) {
    const addressId = data.addressId ?? booking.addressId;
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: session.id },
      select: { lat: true, lng: true },
    });
    if (!address) return NextResponse.json({ error: "Address not found" }, { status: 404 });
    const slot = data.slot ?? booking.slot;
    const scheduleType = data.scheduleType ?? booking.scheduleType;
    const available = await findAvailablePartners({
      service: booking.service,
      addrLat: address.lat ?? 17.385,
      addrLng: address.lng ?? 78.4867,
      slot,
      scheduleType: scheduleType as "instant" | "scheduled",
      durationMinutes: data.durationMinutes ?? booking.durationMinutes,
    });
    if (available.ranked.length === 0) {
      return NextResponse.json(
        { error: "No professional is available for this time. Choose another slot." },
        { status: 409 },
      );
    }
    if (
      data.preferredPartnerId &&
      !available.ranked.some((partner) => partner.id === data.preferredPartnerId)
    ) {
      return NextResponse.json(
        { error: "That professional is no longer available. Choose another one." },
        { status: 409 },
      );
    }
  }

  if (data.slot || data.slotConfirmed === false) {
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(booking.archetypeDetails || "{}");
      details = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {}
    update.archetypeDetails = JSON.stringify({ ...details, slotConfirmed: data.slot ? true : false });
    if (data.slotConfirmed === false) update.preferredPartnerId = null;
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
