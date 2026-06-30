import { NextRequest, NextResponse } from "next/server";
import { listProperties } from "@/lib/accommodation/queries";
import type { AccommodationFilters } from "@/lib/accommodation/types";
import type { AccommodationTypeSlug } from "@/lib/accommodation/constants";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const filters: AccommodationFilters = {
    type: (p.get("type") as AccommodationTypeSlug) || "",
    budgetMin: p.get("budgetMin") ? Number(p.get("budgetMin")) : undefined,
    budgetMax: p.get("budgetMax") ? Number(p.get("budgetMax")) : undefined,
    ac: (p.get("ac") as AccommodationFilters["ac"]) || "",
    furnished: (p.get("furnished") as AccommodationFilters["furnished"]) || "",
    sharing: (p.get("sharing") as AccommodationFilters["sharing"]) || "",
    foodIncluded: p.get("foodIncluded") === "true",
    gender: (p.get("gender") as AccommodationFilters["gender"]) || "",
  };

  const properties = await listProperties(filters);
  return NextResponse.json({ properties });
}
