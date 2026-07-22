import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/** The customer's placed marketplace orders, newest first. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.productOrder.findMany({
    where: { userId: session.id, status: { not: "CART" } },
    include: { items: { include: { product: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      orderRef: o.orderRef,
      status: o.status,
      totalPaise: o.totalPaise,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.reduce((s, i) => s + i.qty, 0),
      items: o.items.map((i) => ({ name: i.product.name, qty: i.qty, totalPaise: i.totalPaise })),
    })),
  });
}
