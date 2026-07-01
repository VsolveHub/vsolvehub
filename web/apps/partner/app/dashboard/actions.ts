"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vsolve/db";
import { requirePartner } from "@/lib/auth";
import { uploadKycFile } from "@/lib/kyc-storage";
import { validateUploadFile, DOC_ACCEPT } from "@/lib/upload-rules";
import { filterSkillIdsForTrade } from "@/lib/service-skills";

/** Dev-only: simulate an admin verifying the partner so the active state is viewable. */
export async function devApprove(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const partner = await requirePartner();
  await prisma.partner.update({
    where: { id: partner.id },
    data: { status: "ACTIVE" },
  });
  revalidatePath("/dashboard");
}

export type FormResult = { ok?: boolean; error?: string };

/** Upload or re-upload a compliance document; resets it to PENDING review. */
export async function uploadDocument(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const type = String(formData.get("type") ?? "").trim() || "OTHER";
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file to upload." };

  const invalid = validateUploadFile(file, { label: "document", accept: DOC_ACCEPT });
  if (invalid) return { error: invalid };

  const result = await uploadKycFile(partner.id, type, file);
  if (!result.ok) return { error: result.error };
  const url = result.path;

  const existing = await prisma.document.findFirst({ where: { partnerId: partner.id, type } });
  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: { url, status: "PENDING", reason: null, createdAt: new Date() },
    });
  } else {
    await prisma.document.create({ data: { partnerId: partner.id, type, url } });
  }
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function updateSkills(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const requestedSkillIds = formData.getAll("skills").map(String).filter(Boolean);
  const skillIds = await filterSkillIdsForTrade(requestedSkillIds, partner.trade?.slug);
  const cityId = String(formData.get("cityId") ?? "") || null;

  await prisma.partnerSkill.deleteMany({ where: { partnerId: partner.id } });
  if (skillIds.length) {
    await prisma.partnerSkill.createMany({
      data: skillIds.map((skillId) => ({ partnerId: partner.id, skillId })),
    });
  }
  await prisma.partner.update({ where: { id: partner.id }, data: { cityId } });
  revalidatePath("/dashboard/skills");
  return { ok: true };
}

export async function updateProfile(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const partner = await requirePartner();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { error: "Name can't be empty." };
  await prisma.partner.update({ where: { id: partner.id }, data: { fullName } });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
