import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { reportDispute } from "@/lib/crew/queries";

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  const result = await reportDispute(ref, session.id, reason);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
