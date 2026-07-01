import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Magic-link landing target (PKCE code exchange). Only establishes the
// Supabase session — the AdminUser allowlist check happens in requireAdmin()
// on whatever page this redirects to, so it can't be bypassed or duplicated.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/partners`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
