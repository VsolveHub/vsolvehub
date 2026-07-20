import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { addressSchema, buildFullAddress } from "@/lib/validation/schemas";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const addresses = await prisma.address.findMany({
    where: { userId: session.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ addresses });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const fullAddress = buildFullAddress(data);

  const createData = {
    userId: session.id,
    label: data.label,
    fullAddress,
    houseNumber: data.houseNumber,
    landmark: data.landmark,
    area: data.area,
    city: data.city,
    pincode: data.pincode,
    lat: data.lat,
    lng: data.lng,
    isDefault: data.isDefault ?? false,
  };

  // Clearing the old default and setting the new one must be atomic, or two
  // concurrent writes can leave the user with zero or two default addresses.
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({ where: { userId: session.id }, data: { isDefault: false } });
    }
    return tx.address.create({ data: createData });
  });

  return NextResponse.json({ address });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Address id required" }, { status: 400 });
  }

  // Atomic swap of the default flag so a concurrent PUT can't leave two defaults.
  const address = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { userId: session.id }, data: { isDefault: false } });
    return tx.address.update({ where: { id, userId: session.id }, data: { isDefault: true } });
  });

  return NextResponse.json({ address });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Address id required" }, { status: 400 });
  }

  await prisma.address.deleteMany({
    where: { id, userId: session.id },
  });

  return NextResponse.json({ success: true });
}
