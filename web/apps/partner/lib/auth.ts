import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma, type Partner } from "@vsolve/db";
import { readSession } from "./session";

export type PartnerWithRelations = Partner & {
  trade: { slug: string; name: string } | null;
  city: { slug: string; name: string } | null;
};

/** Returns the logged-in partner or null.
 *  Wrapped in React `cache()` so multiple callers within a single request
 *  (layout + page + components) share one query instead of re-hitting the DB. */
export const getCurrentPartner = cache(
  async (): Promise<PartnerWithRelations | null> => {
    const id = await readSession();
    if (!id) return null;
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        trade: { select: { slug: true, name: true } },
        city: { select: { slug: true, name: true } },
      },
    });
    return partner;
  },
);

/** Redirects to /login when there is no session. */
export async function requirePartner(): Promise<PartnerWithRelations> {
  const partner = await getCurrentPartner();
  if (!partner) redirect("/login");
  return partner;
}
