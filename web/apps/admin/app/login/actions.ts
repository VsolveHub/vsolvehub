"use server";

import { headers } from "next/headers";
import { prisma } from "@vsolve/db";
import { createClient } from "@/utils/supabase/server";

export type AuthState = { error?: string; sent?: boolean };

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  // Minimal shape check — Supabase itself validates deliverability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * The origin the request actually arrived on. Derived from the (forwarded)
 * request headers so the magic-link redirect points at the real deployment
 * domain on Vercel and at localhost in dev — without depending on a
 * build-time NEXT_PUBLIC_SITE_URL that's easy to forget. NOTE: the resulting
 * URL must still be added to Supabase Auth → URL Configuration → Redirect URLs,
 * otherwise Supabase ignores it and falls back to the project Site URL.
 */
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002").replace(/\/+$/, "");
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Enter a valid email address." };

  // Only allowlisted admins get a link. Checking here (rather than only after
  // the link is clicked) avoids emailing / creating Supabase auth users for
  // unknown addresses. requireAdmin() still re-checks on every page as defense
  // in depth. Trade-off: this makes admin emails weakly enumerable — acceptable
  // for an internal, no-index console.
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) return { error: "Invalid email — this address isn't authorized for admin access." };

  const origin = await resolveOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    // Surface the real Supabase reason (rate limit / provider disabled / bad key)
    // — this is an internal console, so the detail is helpful, not sensitive.
    console.error("[admin-login] signInWithOtp failed:", error.status, error.message);
    return { error: `Couldn't send the link: ${error.message}` };
  }
  return { sent: true };
}
