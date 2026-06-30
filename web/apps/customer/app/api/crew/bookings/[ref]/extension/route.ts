import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { approveExtension, declineExtension } from "@/lib/crew/queries";

const schema = z.object({
  action: z.enum(["approve", "decline"]),
  paymentMethod: z.string().min(1).max(40).optional(),
});

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result =
    parsed.data.action === "approve"
      ? await approveExtension(ref, session.id, parsed.data.paymentMethod ?? "upi")
      : await declineExtension(ref, session.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
