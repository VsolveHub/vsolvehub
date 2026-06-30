import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: redirect to /login when no session cookie is present.
// Full HMAC verification happens server-side in requirePartner().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("vsh_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/live/:path*", "/dashboard/:path*", "/onboarding/:path*"],
};
