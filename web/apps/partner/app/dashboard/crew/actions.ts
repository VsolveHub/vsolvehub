"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vsolve/db";
import { requirePartner } from "@/lib/auth";
import { generateInviteToken, getCrewForPartner, getOwnedMember } from "@/lib/crew";
import { isValidRole } from "@/lib/crew-constants";

export type FormResult = { ok?: boolean; error?: string; memberId?: string };

const DASHBOARD = "/dashboard/crew";

const equipmentToJson = (raw: string) =>
  JSON.stringify(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
  );

const crewProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter a crew name").max(60),
  equipment: z.string().trim().max(400).optional().default(""),
});

const memberSchema = z.object({
  name: z.string().trim().min(2, "Enter the member's name").max(60),
  role: z.string().trim().refine(isValidRole, "Choose a valid role"),
  skillLevel: z.enum(["lead", "skilled", "helper"]).default("skilled"),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile")
    .optional()
    .default(""),
  dayRate: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d]/g, ""))
    .optional()
    .default(""),
});

/** First-time setup: create the partner's single crew (DRAFT). */
export async function createCrew(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const existing = await prisma.crew.findUnique({ where: { leadPartnerId: partner.id } });
  if (existing) return { ok: true };

  const parsed = crewProfileSchema.safeParse({
    name: formData.get("name"),
    equipment: formData.get("equipment"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid details" };

  await prisma.crew.create({
    data: {
      leadPartnerId: partner.id,
      name: parsed.data.name,
      tradeSlug: partner.trade?.slug ?? "general",
      city: partner.city?.name ?? "Hyderabad",
      equipment: equipmentToJson(parsed.data.equipment),
    },
  });
  revalidatePath(DASHBOARD);
  return { ok: true };
}

export async function updateCrewProfile(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const crew = await prisma.crew.findUnique({ where: { leadPartnerId: partner.id } });
  if (!crew) return { error: "Create your crew first" };

  const parsed = crewProfileSchema.safeParse({
    name: formData.get("name"),
    equipment: formData.get("equipment"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid details" };

  await prisma.crew.update({
    where: { id: crew.id },
    data: { name: parsed.data.name, equipment: equipmentToJson(parsed.data.equipment) },
  });
  revalidatePath(DASHBOARD);
  return { ok: true };
}

/** Go live / pause. A crew needs at least one member before it can go ACTIVE. */
export async function setCrewStatus(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const next = String(formData.get("status") ?? "");
  if (!["DRAFT", "ACTIVE", "SUSPENDED"].includes(next)) return;

  const crew = await getCrewForPartner(partner.id);
  if (!crew) return;

  if (next === "ACTIVE") {
    const activeMembers = crew.members.filter((m) => m.status === "ACTIVE").length;
    if (activeMembers < 1) return;
  }
  await prisma.crew.update({ where: { id: crew.id }, data: { status: next as "ACTIVE" } });
  revalidatePath(DASHBOARD);
}

/** Add a roster member and issue an invite token (link + QR). */
export async function addMember(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const crew = await prisma.crew.findUnique({ where: { leadPartnerId: partner.id } });
  if (!crew) return { error: "Create your crew first" };

  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    skillLevel: formData.get("skillLevel") ?? "skilled",
    phone: formData.get("phone") ?? "",
    dayRate: formData.get("dayRate") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid details" };

  const member = await prisma.crewMember.create({
    data: {
      crewId: crew.id,
      name: parsed.data.name,
      role: parsed.data.role,
      skillLevel: parsed.data.skillLevel,
      phone: parsed.data.phone || null,
      dayRatePaise: parsed.data.dayRate ? Number(parsed.data.dayRate) * 100 : null,
      inviteToken: generateInviteToken(),
    },
  });
  revalidatePath(DASHBOARD);
  return { ok: true, memberId: member.id };
}

/** Soft-remove a member (keeps clock-in history intact). */
export async function removeMember(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const memberId = String(formData.get("memberId") ?? "");
  const member = await getOwnedMember(partner.id, memberId);
  if (!member) return;

  await prisma.crewMember.update({ where: { id: member.id }, data: { status: "REMOVED" } });
  revalidatePath(DASHBOARD);
}

/** Save the crew's per-role day rates (drives "Receive Quotes" pricing). */
export async function saveRoleRates(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const crew = await prisma.crew.findUnique({ where: { leadPartnerId: partner.id } });
  if (!crew) return { error: "Create your crew first" };

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rate_")) continue;
    const role = key.slice("rate_".length);
    const rupees = Number(String(value).replace(/[^\d]/g, ""));
    if (!role || !Number.isFinite(rupees) || rupees <= 0) continue;
    await prisma.crewRoleRate.upsert({
      where: { crewId_role: { crewId: crew.id, role } },
      update: { dayRatePaise: rupees * 100 },
      create: { crewId: crew.id, role, dayRatePaise: rupees * 100 },
    });
  }
  revalidatePath(DASHBOARD);
  return { ok: true };
}

/** Issue a fresh token, invalidating any previously shared link/QR. */
export async function regenerateInvite(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const memberId = String(formData.get("memberId") ?? "");
  const member = await getOwnedMember(partner.id, memberId);
  if (!member) return;

  await prisma.crewMember.update({
    where: { id: member.id },
    data: { inviteToken: generateInviteToken(), status: "INVITED", joinedAt: null },
  });
  revalidatePath(DASHBOARD);
}
