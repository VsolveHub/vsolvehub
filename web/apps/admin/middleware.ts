import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { formatRequestTimingLog } from "@vsolve/config";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/access-denied"];

export async function middleware(request: NextRequest) {
  const start = performance.now();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const authStart = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authMs = Math.round(performance.now() - authStart);

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  let finalResponse = response;
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    finalResponse = NextResponse.redirect(url);
  }

  const totalMs = Math.round(performance.now() - start);
  const appCodeMs = Math.max(0, totalMs - authMs);

  const breakdown = {
    "auth-check": authMs,
    "application-code": appCodeMs,
  };

  const status = finalResponse.status || 200;
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  finalResponse.headers.set(
    "Server-Timing",
    `auth;dur=${authMs}, application_code;dur=${appCodeMs}`
  );

  console.log(
    formatRequestTimingLog(request.method, path, status, totalMs, breakdown)
  );

  return finalResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
