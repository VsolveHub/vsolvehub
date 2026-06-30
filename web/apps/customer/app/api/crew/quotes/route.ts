import { NextRequest, NextResponse } from "next/server";
import { matchCrews } from "@/lib/crew/queries";
import { crewQuoteSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = crewQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { roles, durationDays, tradeSlug, startDate } = parsed.data;
  const quotes = await matchCrews(roles, durationDays, { tradeSlug, startDate });

  return NextResponse.json({ quotes, durationDays });
}
