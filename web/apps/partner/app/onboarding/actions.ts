"use server";

import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { encrypt, last4 } from "@vsolve/crypto";
import { serviceBySlug, isExperienceBand } from "@vsolve/config";
import { requirePartner } from "@/lib/auth";
import { formSteps, nextPath, stepIndex } from "@/lib/onboarding";
import { createKycUploadUrl, verifyKycObject, type SignedUploadResult } from "@/lib/kyc-storage";

export type StepState = { error?: string };

const TERMS_ERROR = "Please accept the Terms of Service and Privacy Policy to submit your application.";
const SAVE_FAILED =
  "We couldn't save your details right now. Please check your connection and try again.";

/**
 * Runs a database mutation, converting any failure (pooler timeout, transient
 * connection drop, etc.) into a user-facing error string instead of letting it
 * throw through to Next's opaque "server-side exception" screen. Returns null
 * on success. NOTE: never wrap `redirect()` in here — it throws NEXT_REDIRECT
 * by design and must bubble up.
 */
async function persist(label: string, op: () => Promise<unknown>): Promise<string | null> {
  try {
    await op();
    return null;
  } catch (e) {
    console.error(`[onboarding] ${label} failed:`, e);
    return SAVE_FAILED;
  }
}

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
  // A DB hiccup here just returns the partner to the service picker rather than
  // white-screening — this is a plain form action with no inline error channel.
  await persist("chooseService", async () => {
    const row = await prisma.trade.upsert({
      where: { slug },
      update: { name: svc.name, archetype: svc.archetype, tagline: svc.tagline },
      create: { slug, name: svc.name, archetype: svc.archetype, tagline: svc.tagline },
    });
    await prisma.partner.update({
      where: { id: partner.id },
      data: { tradeId: row.id, providerType: svc.archetype },
    });
  });
  redirect("/onboarding");
}

/**
 * Persists step progression and returns a user-facing error string on failure,
 * or redirects to the next step on success (the redirect throws NEXT_REDIRECT
 * and never returns). The final form step submits the application for review.
 */
async function advance(
  partnerId: string,
  type: Parameters<typeof nextPath>[0],
  currentId: string,
): Promise<string | null> {
  const idx = stepIndex(type, currentId);
  const isLast = idx === formSteps(type).length - 1;
  const err = await persist("advance", () =>
    prisma.partner.update({
      where: { id: partnerId },
      data: isLast ? { status: "PENDING", onboardingStep: 99 } : { onboardingStep: idx + 1 },
    }),
  );
  if (err) return err;
  redirect(nextPath(type, currentId));
}

/**
 * Server action the client calls to obtain a signed URL for a direct-to-storage
 * KYC upload. Auth-gated: the object path is derived from the authenticated
 * partner id, so a client can never mint a URL into someone else's folder.
 */
export async function requestKycUpload(
  docType: string,
  filename: string,
): Promise<SignedUploadResult> {
  const partner = await requirePartner();
  return createKycUploadUrl(partner.id, docType, filename);
}

/**
 * Records a KYC document that the browser already uploaded directly to storage.
 * `path` is the object path the client received from `requestKycUpload`. When
 * absent: a required doc errors unless one is already on file (so revisiting a
 * step doesn't force a re-upload); an optional doc is simply skipped. Verifies
 * ownership/existence/size server-side before writing, and replaces any prior
 * document of the same type so retries don't pile up duplicates.
 */
async function recordDocument(
  partnerId: string,
  type: string,
  path: string,
  opts: { required: boolean; label: string },
): Promise<string | null> {
  if (!path) {
    if (!opts.required) return null;
    const existing = await prisma.document.findFirst({ where: { partnerId, type } });
    return existing ? null : `Please upload your ${opts.label}.`;
  }
  const invalid = await verifyKycObject(partnerId, path);
  if (invalid) return invalid;
  return persist("document.record", async () => {
    await prisma.document.deleteMany({ where: { partnerId, type } });
    await prisma.document.create({ data: { partnerId, type, url: path } });
  });
}

export async function saveIdentity(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) return { error: "Please enter your full name." };

  const gender = String(formData.get("gender") ?? "").trim();
  if (!["MALE", "FEMALE", "OTHER"].includes(gender)) return { error: "Please select your gender." };

  // Aadhaar number is optional — but if provided it must be a valid 12-digit number.
  const aadhaar = String(formData.get("aadhaar") ?? "").replace(/\D/g, "");
  if (aadhaar.length > 0 && aadhaar.length !== 12) {
    return { error: "Aadhaar must be 12 digits, or leave it blank to add later." };
  }

  const saveError = await persist("saveIdentity", () =>
    prisma.partner.update({
      where: { id: partner.id },
      data: {
        fullName,
        gender,
        ...(aadhaar ? { aadhaarEnc: encrypt(aadhaar), aadhaarLast4: last4(aadhaar) } : {}),
      },
    }),
  );
  if (saveError) return { error: saveError };

  // The profile photo is the only mandatory document collected up front.
  const photoError = await recordDocument(
    partner.id,
    "SELFIE",
    String(formData.get("profilePhoto") ?? ""),
    { required: true, label: "profile photo" },
  );
  if (photoError) return { error: photoError };

  const advanceError = await advance(partner.id, partner.providerType, "identity");
  return advanceError ? { error: advanceError } : {};
}

export async function saveSkills(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();

  // Final step for Captain/Cleaner → this submits the application.
  if (!termsAccepted(formData)) return { error: TERMS_ERROR };

  const skills = formData.getAll("skills").map(String).filter(Boolean);
  if (skills.length === 0) return { error: "Select at least one service you can handle." };

  const experience = String(formData.get("experience") ?? "").trim();
  if (!isExperienceBand(experience)) return { error: "Please select your experience." };

  const area = String(formData.get("area") ?? "").trim();
  const cityName = String(formData.get("cityName") ?? "").trim();
  const pincode = String(formData.get("pincode") ?? "").replace(/\D/g, "");
  if (!area) return { error: "Enter your service area / locality." };
  if (!cityName) return { error: "Enter your city." };
  if (pincode.length !== 6) return { error: "Enter a valid 6-digit pincode." };

  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  const saveError = await persist("saveSkills", () =>
    prisma.partner.update({
      where: { id: partner.id },
      data: {
        servicesOffered: JSON.stringify(skills),
        experience,
        area,
        cityName,
        pincode,
        ...(hasGeo ? { lat, lng } : {}),
      },
    }),
  );
  if (saveError) return { error: saveError };
  // Trade certificate stays optional — many skilled partners have no formal cert.
  const uploadError = await recordDocument(
    partner.id,
    "TRADE_CERTIFICATE",
    String(formData.get("tradeCert") ?? ""),
    { required: false, label: "trade certificate" },
  );
  if (uploadError) return { error: uploadError };
  const advanceError = await advance(partner.id, partner.providerType, "skills");
  return advanceError ? { error: advanceError } : {};
}

export async function saveVehicle(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();
  const type = String(formData.get("vehicleType") ?? "").trim();
  const regNumber = String(formData.get("regNumber") ?? "").trim().toUpperCase();
  if (!type || !regNumber) return { error: "Vehicle type and registration number are required." };

  // RC is stored on the Vehicle row (not as a Document). It's now mandatory — a
  // driver can't operate without a valid registration certificate.
  const rcPath = String(formData.get("rc") ?? "");
  let rcUrl: string | null = null;
  if (rcPath) {
    const invalid = await verifyKycObject(partner.id, rcPath);
    if (invalid) return { error: invalid };
    rcUrl = rcPath;
  } else {
    const existing = await prisma.vehicle.findUnique({
      where: { partnerId: partner.id },
      select: { rcUrl: true },
    });
    if (!existing?.rcUrl) return { error: "Please upload your Registration Certificate (RC)." };
  }

  const saveError = await persist("saveVehicle", () =>
    prisma.vehicle.upsert({
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
    }),
  );
  if (saveError) return { error: saveError };
  const advanceError = await advance(partner.id, partner.providerType, "vehicle");
  return advanceError ? { error: advanceError } : {};
}

export async function saveDocuments(_prev: StepState, formData: FormData): Promise<StepState> {
  const partner = await requirePartner();

  // Final step for Driver → this submits the application. Aadhaar is collected
  // on the Identity step; the driving licence is the mandatory doc here.
  if (!termsAccepted(formData)) return { error: TERMS_ERROR };

  const dlError = await recordDocument(
    partner.id,
    "DRIVING_LICENCE",
    String(formData.get("dlDoc") ?? ""),
    { required: true, label: "driving licence" },
  );
  if (dlError) return { error: dlError };

  const advanceError = await advance(partner.id, partner.providerType, "documents");
  return advanceError ? { error: advanceError } : {};
}
