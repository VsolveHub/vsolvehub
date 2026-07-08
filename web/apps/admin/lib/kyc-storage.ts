import "server-only";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "kyc";
const SIGNED_URL_TTL_SECONDS = 60;

let serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (serviceClient) return serviceClient;
  // KYC files live in a dedicated Storage project (the private "kyc" bucket the
  // partner app uploads to), which may differ from the admin auth/DB project.
  // Prefer KYC-specific vars; fall back to the generic ones when they're the
  // same project.
  const url = process.env.KYC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.KYC_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase KYC storage credentials are not configured");
  serviceClient = createClient(url, key, { auth: { persistSession: false } });
  return serviceClient;
}

/** Legacy docs were saved as local `/uploads/...` paths (or absolute URLs) by
 *  the partner app's dev-only file storage — those aren't objects in the `kyc`
 *  Storage bucket, so they must never be sent to createSignedUrl(). */
function isStorageObjectPath(url: string): boolean {
  return !/^https?:\/\//i.test(url) && !url.startsWith("/");
}

export type DocPreview =
  | { kind: "signed"; url: string }
  | { kind: "legacy"; url: string }
  | { kind: "unavailable" };

/** Resolves a Document.url into something the UI can render, degrading
 *  gracefully instead of throwing for legacy/local paths or storage errors. */
export async function resolveDocPreview(rawUrl: string): Promise<DocPreview> {
  if (!isStorageObjectPath(rawUrl)) {
    return { kind: "legacy", url: rawUrl };
  }
  try {
    const { data, error } = await getServiceClient()
      .storage.from(BUCKET)
      .createSignedUrl(rawUrl, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return { kind: "unavailable" };
    return { kind: "signed", url: data.signedUrl };
  } catch {
    return { kind: "unavailable" };
  }
}
