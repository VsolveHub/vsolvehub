import { NextRequest, NextResponse } from "next/server";
import { searchServices } from "@/lib/catalog/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const services = await searchServices(q);
  return NextResponse.json({ services, query: q });
}
