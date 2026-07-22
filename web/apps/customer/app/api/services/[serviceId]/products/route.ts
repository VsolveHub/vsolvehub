import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getProductsForService } from "@vsolve/db";

/**
 * Products mapped to a service (service-level ∪ subcategory-level). This is the
 * only product list the booking flow and the partner parts picker may show —
 * an electrical job never surfaces plumbing accessories.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const products = await getProductsForService(prisma, serviceId);
  return NextResponse.json({ products });
}
