import { NextRequest, NextResponse } from "next/server";
import { getCurrentPartner } from "@/lib/auth";
import { listPendingRequests, acceptOffer, declineOffer } from "@/lib/crew-offers";

export async function GET() {
  const partner = await getCurrentPartner();
  if (!partner) return NextResponse.json({ requests: [] });
  const requests = await listPendingRequests(partner.id);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const partner = await getCurrentPartner();
  if (!partner) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const offerId = String(body.offerId ?? "");
  const action = String(body.action ?? "");
  if (!offerId || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = action === "accept" ? await acceptOffer(partner.id, offerId) : await declineOffer(partner.id, offerId);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Failed" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
