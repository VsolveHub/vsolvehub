"use server";

import { prisma } from "@vsolve/db";
import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/auth";

/**
 * Persist the captain's online/offline state. Dispatch matches on
 * `Partner.isOnline`, so going online MUST write to the DB — a client-only
 * toggle leaves the partner invisible to bookings. A default service location
 * is seeded on first go-online so geo-matching has coordinates.
 */
export async function setOnlineStatus(online: boolean): Promise<{ ok: boolean }> {
  const partner = await requirePartner();
  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      isOnline: online,
      ...(online && partner.lat == null ? { lat: 17.4401, lng: 78.3489 } : {}),
    },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
