import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { savedServiceSchema } from "@/lib/validation/schemas";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const saved = await prisma.savedService.findMany({
    where: { userId: session.id },
    include: { service: { include: serviceInclude } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    saved: saved.map((item) => ({
      id: item.id,
      service: serializeService(item.service),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = savedServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const saved = await prisma.savedService.upsert({
    where: {
      userId_serviceId: {
        userId: session.id,
        serviceId: parsed.data.serviceId,
      },
    },
    update: {},
    create: {
      userId: session.id,
      serviceId: parsed.data.serviceId,
    },
    include: { service: { include: serviceInclude } },
  });

  return NextResponse.json({ saved: serializeService(saved.service) });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  if (!serviceId) {
    return NextResponse.json({ error: "serviceId required" }, { status: 400 });
  }

  await prisma.savedService.deleteMany({
    where: { userId: session.id, serviceId },
  });

  return NextResponse.json({ success: true });
}
