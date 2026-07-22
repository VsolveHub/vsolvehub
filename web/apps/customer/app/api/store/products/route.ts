import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { toPublicProduct } from "@vsolve/db";
import type { Prisma } from "@vsolve/db";

/** Marketplace browse: active products, filterable by category slug + search. */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(category ? { productCategory: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { brand: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, productCategory: true },
      orderBy: [{ productCategory: { sortOrder: "asc" } }, { name: "asc" }],
      take: 100,
    }),
    prisma.productCategory.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, icon: true },
    }),
  ]);

  return NextResponse.json({ products: products.map((p) => toPublicProduct(p)), categories });
}
