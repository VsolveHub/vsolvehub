import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { toPublicProduct } from "@vsolve/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { brand: true, productCategory: true },
  });
  if (!product || !product.isActive) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json({ product: toPublicProduct(product) });
}
