import { NextRequest, NextResponse } from "next/server";
import { driveReassignmentIfPending } from "@/lib/fulfillment/assign";

// ─────────────────────────────────────────────────────────────────────────────
// Internal, service-to-service only. The partner app calls this the instant a
// professional releases a job ("Can't make it") so reassignment happens now
// rather than waiting for the customer's next tracker poll. It lives in the
// CUSTOMER app on purpose: reassignment can refund, and the payment gateway
// (and the matcher) live here — so all money and matching stay in one process.
//
// Guarded by a shared secret. If INTERNAL_DISPATCH_SECRET is unset the endpoint
// is disabled and the partner call is skipped; the tracker poll remains the
// backstop, so an unconfigured deployment simply reassigns a few seconds later.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Internal dispatch disabled" }, { status: 404 });
  }
  if (req.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let bookingId: unknown;
  try {
    ({ bookingId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof bookingId !== "string" || !bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }

  // No-op unless the booking is genuinely mid-reassignment (SEARCHING_PROVIDER,
  // unassigned, archetype A) — safe to call regardless of what the caller knows.
  await driveReassignmentIfPending(bookingId);
  return NextResponse.json({ ok: true });
}
