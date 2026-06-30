import { NextRequest, NextResponse } from "next/server";
import { getPropertyById } from "@/lib/accommodation/queries";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const property = await getPropertyById(id);
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  return NextResponse.json({ property });
}
