"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client used ONLY to PUT KYC files to a pre-signed
// upload URL. It carries the public anon key (safe to ship) and never persists
// a session — the signed token minted by the server is what authorises each
// upload, so this client needs no user auth of its own.
const BUCKET = "kyc";

let browserClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public credentials are not configured");
  browserClient = createClient(url, key, { auth: { persistSession: false } });
  return browserClient;
}

/**
 * Uploads a file directly to Supabase Storage using a server-minted signed URL.
 * Resolves with the object path on success; throws on failure (the caller maps
 * that to a friendly, retryable UI state).
 */
export async function uploadToSignedUrl(
  path: string,
  token: string,
  file: File,
): Promise<string> {
  const { error } = await client()
    .storage.from(BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || undefined,
    });
  if (error) throw error;
  return path;
}
