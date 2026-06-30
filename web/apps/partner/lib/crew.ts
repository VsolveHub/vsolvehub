import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@vsolve/db";

export { CREW_ROLES, SKILL_LEVELS, isValidRole, roleLabel } from "./crew-constants";

/**
 * Crew = a lead Partner (the contractor) plus a roster of members. Members are
 * roster data only — never Partner/Provider rows — so they can never receive
 * individual dispatch. Money is a flat, lead-settled price; member presence is
 * captured as clock-in/out (no payroll here). See the customer phase for the
 * dispatch + booking bridge.
 */

/** High-entropy, URL-safe token backing a member's invite link and personal QR. */
export function generateInviteToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Absolute base URL for invite links/QRs (the partner site). */
export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export function inviteUrl(token: string): string {
  return `${siteBaseUrl()}/crew/join/${token}`;
}

export type CrewWithMembers = NonNullable<Awaited<ReturnType<typeof getCrewForPartner>>>;

/** The crew owned by this partner, with its non-removed roster. */
export function getCrewForPartner(partnerId: string) {
  return prisma.crew.findUnique({
    where: { leadPartnerId: partnerId },
    include: {
      members: {
        where: { status: { not: "REMOVED" } },
        orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
      },
    },
  });
}

/**
 * Loads a member only if it belongs to the given partner's crew. Returns null
 * otherwise — the single authorization gate every member mutation must pass.
 */
export async function getOwnedMember(partnerId: string, memberId: string) {
  const member = await prisma.crewMember.findUnique({
    where: { id: memberId },
    include: { crew: { select: { leadPartnerId: true } } },
  });
  if (!member || member.crew.leadPartnerId !== partnerId) return null;
  return member;
}

export function parseEquipment(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
