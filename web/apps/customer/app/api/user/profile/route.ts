import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
  });
}
