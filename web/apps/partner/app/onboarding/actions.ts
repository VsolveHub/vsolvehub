"use server";

import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { encrypt, last4 } from "@vsolve/crypto";
import { serviceBySlug } from "@vsolve/config";
import { requirePartner } from "@/lib/auth";
import { formSteps, nextPath, stepIndex } from "@/lib/onboarding";
import { uploadKycFile } from "@/lib/kyc-storage";
import { validateUploadFile, IMAGE_ACCEPT, DOC_ACCEPT } from "@/lib/upload-rules";

export type StepState = { error?: string };

const TERMS_ERROR = "Please accept the Terms of Service and Privacy Policy to submit your application.";

/** Final-step guard — the application isn't submitted without explicit consent.
 *  Enforced server-side so it can't be bypassed by disabling the client checkbox. */
function termsAccepted(formData: FormData): boolean {
  return formData.get("acceptedTerms") === "yes";
}

export async function chooseService(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const slug = String(formData.get("service") ?? "");
  const svc = serviceBySlug(slug);
  if (!svc) redirect("/onboarding");
  const row = await prisma.trade.upsert({
    where: { slug },
    update: { name: svc.name, archetype: svc.archetype, tagline: svc.tagline },
    create: { slug, name: svc.name, archetype: svc.archetype, tagline: svc.tagline },
  });
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

/**
 * Validates, uploads, and records an optional KYC document. Returns a
 * user-facing error string, or null on success (including when no file was
 * provided — optional uploads are simply skipped).
 */
async function storeDocument(
  partnerId: string,
  type: string,
  file: File | null,
  opts: { label: string; accept: string },
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const invalid = validateUploadFile(file, opts);
  if (invalid) return invalid;
  const result = await uploadKycFile(partnerId, type, file);
  if (!result.ok) return result.error;
  await prisma.document.create({ data: { partnerId, type, url: result.path } });
  return null;
}

export async function saveIdentity(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) return { error: "Please enter your full name." };

  const gender = String(formData.get("gender") ?? "").trim();
  if (!["MALE", "FEMALE", "OTHER"].includes(gender)) return { error: "Please select your gender." };

  const aadhaar = String(formData.get("aadhaar") ?? "").replace(/\D/g, "");
  if (aadhaar.length !== 12) return { error: "Enter your 12-digit Aadhaar number." };

  // Profile photo is mandatory — but don't force a re-upload if one already exists.
  const photo = formData.get("profilePhoto") as File | null;
  const hasPhoto = !!(photo && photo.size > 0);
  if (!hasPhoto) {
    const existing = await prisma.document.findFirst({ where: { partnerId: partner.id, type: "SELFIE" } });
    if (!existing) return { error: "A profile photo is required." };
  } else {
    // Validate before writing any data so a bad photo can't leave a partial save.
    const invalid = validateUploadFile(photo!, { label: "profile photo", accept: IMAGE_ACCEPT });
    if (invalid) return { error: invalid };
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: { fullName, gender, aadhaarEnc: encrypt(aadhaar), aadhaarLast4: last4(aadhaar) },
  });
  if (hasPhoto) {
    const uploadError = await storeDocument(partner.id, "SELFIE", photo, {
      label: "profile photo",
      accept: IMAGE_ACCEPT,
    });
    if (uploadError) return { error: uploadError };
  }
  await advance(partner.id, partner.providerType, "identity");
  return {};
}

export async function saveSkills(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();

  // Final step for Captain/Cleaner → this submits the application.
  if (!termsAccepted(formData)) return { error: TERMS_ERROR };

  const skills = formData.getAll("skills").map(String).filter(Boolean);
  if (skills.length === 0) return { error: "Select at least one service you can handle." };

  const area = String(formData.get("area") ?? "").trim();
  const cityName = String(formData.get("cityName") ?? "").trim();
  const pincode = String(formData.get("pincode") ?? "").replace(/\D/g, "");
  if (!area) return { error: "Enter your service area / locality." };
  if (!cityName) return { error: "Enter your city." };
  if (pincode.length !== 6) return { error: "Enter a valid 6-digit pincode." };

  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  // Optional trade certificate — validate up front before any write.
  const cert = formData.get("tradeCert") as File | null;
  if (cert && cert.size > 0) {
    const invalid = validateUploadFile(cert, { label: "trade certificate", accept: DOC_ACCEPT });
    if (invalid) return { error: invalid };
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      servicesOffered: JSON.stringify(skills),
      area,
      cityName,
      pincode,
      ...(hasGeo ? { lat, lng } : {}),
    },
  });
  const uploadError = await storeDocument(partner.id, "TRADE_CERTIFICATE", cert, {
    label: "trade certificate",
    accept: DOC_ACCEPT,
  });
  if (uploadError) return { error: uploadError };
  await advance(partner.id, partner.providerType, "skills");
  return {};
}

export async function saveVehicle(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  const type = String(formData.get("vehicleType") ?? "").trim();
  const regNumber = String(formData.get("regNumber") ?? "").trim().toUpperCase();
  if (!type || !regNumber) return { error: "Vehicle type and registration number are required." };

  // RC is stored on the Vehicle row (not as a Document), so upload it inline.
  const rc = formData.get("rc") as File | null;
  let rcUrl: string | null = null;
  if (rc && rc.size > 0) {
    const invalid = validateUploadFile(rc, { label: "registration certificate", accept: DOC_ACCEPT });
    if (invalid) return { error: invalid };
    const result = await uploadKycFile(partner.id, "RC", rc);
    if (!result.ok) return { error: result.error };
    rcUrl = result.path;
  }

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

  // Final step for Driver → this submits the application.
  if (!termsAccepted(formData)) return { error: TERMS_ERROR };

  const aadhaarError = await storeDocument(
    partner.id,
    "AADHAAR",
    formData.get("aadhaarDoc") as File | null,
    { label: "Aadhaar card", accept: DOC_ACCEPT },
  );
  if (aadhaarError) return { error: aadhaarError };

  const dlError = await storeDocument(
    partner.id,
    "DRIVING_LICENCE",
    formData.get("dlDoc") as File | null,
    { label: "driving licence", accept: DOC_ACCEPT },
  );
  if (dlError) return { error: dlError };

  await advance(partner.id, partner.providerType, "documents");
  return {};
}
