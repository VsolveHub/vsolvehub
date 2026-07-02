import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Magic-link landing target (PKCE code exchange). Only establishes the
// Supabase session — the AdminUser allowlist check happens in requireAdmin()
// on whatever page this redirects to, so it can't be bypassed or duplicated.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Redirect against the externally-visible origin (Vercel proxies the real
  // host via x-forwarded-*), not the internal request URL.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/partners`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
