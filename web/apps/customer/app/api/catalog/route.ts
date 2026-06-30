import { NextRequest, NextResponse } from "next/server";
import {
  getAllServices,
  getCatalogGrouped,
  getCategories,
  getPopularServices,
  getServiceBySlug,
  getServicesByCategory,
  searchServices,
} from "@/lib/catalog/queries";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const slug = req.nextUrl.searchParams.get("slug");
  const grouped = req.nextUrl.searchParams.get("grouped");

  if (grouped === "true") {
    const catalog = await getCatalogGrouped();
    return NextResponse.json({ catalog });
  }

  if (category && slug) {
    const service = await getServiceBySlug(category, slug);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    return NextResponse.json({ service });
  }

  if (category) {
    const services = await getServicesByCategory(category);
    return NextResponse.json({ services });
  }

  const [categories, services, popular] = await Promise.all([
    getCategories(),
    getAllServices(),
    getPopularServices(),
  ]);

  return NextResponse.json({ categories, services, popular });
}
