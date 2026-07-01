import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "kyc";

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
