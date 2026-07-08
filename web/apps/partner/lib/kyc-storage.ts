import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "./upload-rules";

const BUCKET = "kyc";

/** Document types the KYC bucket accepts. Guards the path we mint so a client
 *  can never request an upload URL for an arbitrary folder. */
const ALLOWED_DOC_TYPES = new Set([
  "SELFIE",
  "AADHAAR",
  "DRIVING_LICENCE",
  "TRADE_CERTIFICATE",
  "RC",
]);

function objectPathFor(partnerId: string, docType: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
  return `${partnerId}/${docType}/${randomUUID()}-${safe}`;
}

let serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  serviceClient = createClient(url, key, { auth: { persistSession: false } });
  return serviceClient;
}

/** Discriminated result so callers can surface a friendly message rather than
 *  crashing the whole server action on an upload failure. */
export type KycUploadResult = { ok: true; path: string } | { ok: false; error: string };

const UPLOAD_FAILED_MESSAGE =
  "We couldn't save your document right now. Please try again in a moment.";

/**
 * Uploads a KYC file to the private `kyc` Supabase Storage bucket and returns
 * its object path — NOT a public URL, the bucket is private. admin.vsolvehub.com
 * mints short-lived signed URLs (via SUPABASE_SERVICE_KEY) to preview it.
 *
 * Never throws: the real cause is logged server-side (for developers) while the
 * caller receives a short, user-safe message.
 */
export async function uploadKycFile(
  partnerId: string,
  docType: string,
  file: File,
): Promise<KycUploadResult> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${partnerId}/${docType}/${randomUUID()}-${safe}`;

  try {
    const { error } = await getServiceClient()
      .storage.from(BUCKET)
      .upload(objectPath, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      console.error(`[kyc-upload] ${docType} for ${partnerId} failed:`, error.message);
      return { ok: false, error: UPLOAD_FAILED_MESSAGE };
    }
    return { ok: true, path: objectPath };
  } catch (e) {
    // Missing/invalid Supabase credentials or a network fault land here.
    console.error(`[kyc-upload] ${docType} for ${partnerId} threw:`, e);
    return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  }
}

/** Result of minting a signed upload URL the browser uploads directly to. */
export type SignedUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

/**
 * Mints a short-lived signed upload URL so the browser can PUT a KYC file
 * straight to Supabase Storage — the bytes never pass through the server
 * action. The object path is derived server-side from the authenticated
 * partner id + a validated docType, so a client can't target another partner's
 * folder or an arbitrary bucket location.
 */
export async function createKycUploadUrl(
  partnerId: string,
  docType: string,
  filename: string,
): Promise<SignedUploadResult> {
  if (!ALLOWED_DOC_TYPES.has(docType)) {
    return { ok: false, error: "Unsupported document type." };
  }
  const path = objectPathFor(partnerId, docType, filename);
  try {
    const { data, error } = await getServiceClient()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error(`[kyc-sign] ${docType} for ${partnerId} failed:`, error?.message);
      return { ok: false, error: UPLOAD_FAILED_MESSAGE };
    }
    return { ok: true, path: data.path, token: data.token };
  } catch (e) {
    console.error(`[kyc-sign] ${docType} for ${partnerId} threw:`, e);
    return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  }
}

const VERIFY_FAILED_MESSAGE =
  "Your upload didn't finish. Please choose the file again.";

/**
 * Confirms a client-reported object path really was uploaded by THIS partner,
 * exists in the bucket, and is within the size limit — the authoritative check
 * after a direct upload (a signed URL alone doesn't enforce size). Oversized
 * objects are removed. Returns null on success or a user-facing error string.
 */
export async function verifyKycObject(
  partnerId: string,
  path: string,
): Promise<string | null> {
  // Minted paths always begin with the partner's id — cheap ownership gate.
  if (!path || !path.startsWith(`${partnerId}/`)) return VERIFY_FAILED_MESSAGE;
  try {
    const client = getServiceClient();
    const { data, error } = await client.storage.from(BUCKET).info(path);
    if (error || !data) return VERIFY_FAILED_MESSAGE;
    const size = Number((data as { size?: number }).size ?? 0);
    if (size > MAX_UPLOAD_BYTES) {
      await client.storage.from(BUCKET).remove([path]).catch(() => {});
      return `That file is too large. Please upload a file under ${MAX_UPLOAD_LABEL}.`;
    }
    return null;
  } catch (e) {
    console.error(`[kyc-verify] ${path} threw:`, e);
    return VERIFY_FAILED_MESSAGE;
  }
}
