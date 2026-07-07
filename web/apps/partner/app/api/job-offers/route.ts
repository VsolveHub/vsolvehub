import { NextRequest, NextResponse } from "next/server";
import { getCurrentPartner } from "@/lib/auth";
import { prisma, acceptJobOffer, declineJobOffer } from "@vsolve/db";

/**
 * GET /api/job-offers
 * Returns all non-expired, pending JobAssignment offers for the logged-in partner.
 * The partner's live page polls this every few seconds to surface individual dispatch offers.
 */
export async function GET() {
  const partner = await getCurrentPartner();
  if (!partner) return NextResponse.json({ offers: [] });

  const now = new Date();
  const assignments = await prisma.jobAssignment.findMany({
    where: {
      partnerId: partner.id,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    orderBy: { offeredAt: "asc" },
    include: {
      booking: {
        include: {
          service: { select: { name: true } },
          address: { select: { area: true, city: true, fullAddress: true } },
        },
      },
    },
  });

  const offers = assignments.map((a) => {
    // Structured intake the customer filled in (e.g. Switch type: Modular). Stored
    // as human-readable { label, value } pairs, so we just surface them as-is.
    let details: { label: string; value: string }[] = [];
    try {
      const parsed = JSON.parse(a.booking.archetypeDetails || "{}");
      if (Array.isArray(parsed.details)) details = parsed.details;
    } catch {
      /* no structured details */
    }
    return {
      offerId: a.id,
      bookingRef: a.booking.bookingRef,
      service: a.booking.service.name,
      location: a.booking.address.area || a.booking.address.city || a.booking.address.fullAddress,
      slot: a.booking.slot,
      archetype: a.booking.archetype,
      quotedAmount: a.booking.quotedAmount,
      details,
      note: a.booking.issueDescription || "",
      expiresAt: a.expiresAt.toISOString(),
    };
  });

  return NextResponse.json({ offers });
}

/**
 * POST /api/job-offers
 * Accept or decline a pending JobAssignment.
 * Body: { offerId: string; action: "accept" | "decline" }
 */
export async function POST(req: NextRequest) {
  const partner = await getCurrentPartner();
  if (!partner) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const offerId = String(body.offerId ?? "");
  const action = String(body.action ?? "");

  if (!offerId || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Accept/decline go through the shared fulfillment engine — the single source
  // of truth. Accept binds the partner, expires sibling offers, and generates
  // the customer's start OTP.
  if (action === "decline") {
    await declineJobOffer(offerId, partner.id);
    return NextResponse.json({ ok: true });
  }

  const result = await acceptJobOffer(offerId, partner.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, bookingRef: result.bookingRef });
}
