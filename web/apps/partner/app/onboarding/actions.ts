"use server";

import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { encrypt, last4 } from "@vsolve/crypto";
import { serviceBySlug } from "@vsolve/config";
import { requirePartner } from "@/lib/auth";
import { formSteps, nextPath, stepIndex } from "@/lib/onboarding";
import { saveUpload } from "@/lib/upload";

export type StepState = { error?: string };

export async function chooseService(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const slug = String(formData.get("service") ?? "");
  const svc = serviceBySlug(slug);
  const row = await prisma.trade.findUnique({ where: { slug } });
  if (!svc || !row) redirect("/onboarding");
  await prisma.partner.update({
    where: { id: partner.id },
    data: { tradeId: row.id, providerType: svc.archetype },
  });
  redirect("/onboarding");
}

async function advance(partnerId: string, type: Parameters<typeof nextPath>[0], currentId: string) {
  const idx = stepIndex(type, currentId);
  const isLast = idx === formSteps(type).length - 1;
  await prisma.partner.update({
    where: { id: partnerId },
    // The final form step submits the application for review.
    data: isLast ? { status: "PENDING", onboardingStep: 99 } : { onboardingStep: idx + 1 },
  });
  redirect(nextPath(type, currentId));
}

async function addDocument(partnerId: string, type: string, file: File | null) {
  const url = await saveUpload(file);
  if (url) await prisma.document.create({ data: { partnerId, type, url } });
}

export async function saveIdentity(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { error: "Please enter your full name." };
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const aadhaar = String(formData.get("aadhaar") ?? "").replace(/\s/g, "");

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      fullName,
      gender,
      ...(aadhaar.length === 12
        ? { aadhaarEnc: encrypt(aadhaar), aadhaarLast4: last4(aadhaar) }
        : {}),
    },
  });
  await addDocument(partner.id, "SELFIE", formData.get("profilePhoto") as File | null);
  await advance(partner.id, partner.providerType, "identity");
  return {};
}

export async function saveSkills(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  const skillIds = formData.getAll("skills").map(String).filter(Boolean);
  const cityId = String(formData.get("cityId") ?? "") || null;

  await prisma.partnerSkill.deleteMany({ where: { partnerId: partner.id } });
  if (skillIds.length) {
    await prisma.partnerSkill.createMany({
      data: skillIds.map((skillId) => ({ partnerId: partner.id, skillId })),
    });
  }
  await prisma.partner.update({ where: { id: partner.id }, data: { cityId } });
  await addDocument(partner.id, "TRADE_CERTIFICATE", formData.get("tradeCert") as File | null);
  await advance(partner.id, partner.providerType, "skills");
  return {};
}

export async function saveVehicle(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  const type = String(formData.get("vehicleType") ?? "").trim();
  const regNumber = String(formData.get("regNumber") ?? "").trim().toUpperCase();
  if (!type || !regNumber) return { error: "Vehicle type and registration number are required." };
  const rcUrl = await saveUpload(formData.get("rc") as File | null);

  await prisma.vehicle.upsert({
    where: { partnerId: partner.id },
    update: {
      type,
      make: String(formData.get("make") ?? "") || null,
      model: String(formData.get("model") ?? "") || null,
      regNumber,
      ...(rcUrl ? { rcUrl } : {}),
    },
    create: {
      partnerId: partner.id,
      type,
      make: String(formData.get("make") ?? "") || null,
      model: String(formData.get("model") ?? "") || null,
      regNumber,
      rcUrl,
    },
  });
  await advance(partner.id, partner.providerType, "vehicle");
  return {};
}

export async function saveDocuments(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  await addDocument(partner.id, "AADHAAR", formData.get("aadhaarDoc") as File | null);
  await addDocument(partner.id, "DRIVING_LICENCE", formData.get("dlDoc") as File | null);
  await advance(partner.id, partner.providerType, "documents");
  return {};
}
