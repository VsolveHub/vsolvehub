"use server";

import { createClient } from "@/utils/supabase/server";

export type AuthState = { error?: string; sent?: boolean };

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  // Minimal shape check — Supabase itself validates deliverability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Enter a valid email address." };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  // Authorization (AdminUser allowlist) is enforced after the link is clicked,
  // not here — so this response can't be used to enumerate admin emails.
  if (error) return { error: "Couldn't send the link. Please try again." };
  return { sent: true };
}
