import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { cancelCrewBooking } from "@/lib/crew/queries";

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : undefined;

  const result = await cancelCrewBooking(ref, session.id, reason);
  if (!result) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, feePaise: result.feePaise, finalPaise: result.finalPaise });
}
