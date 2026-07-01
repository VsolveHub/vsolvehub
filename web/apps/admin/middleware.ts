import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Coarse gate: refresh the Supabase session cookie and bounce anonymous
// visitors to /login. The allowlist + role check (AdminUser, via Prisma) is
// enforced separately by requireAdmin() on every page and server action —
// middleware only knows "is there a Supabase session", never "is this email
// an authorized admin".
const PUBLIC_PATHS = ["/login", "/auth/callback", "/access-denied"];

export async function middleware(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Exclude Next internals, robots, and static image assets (logo, favicon,
  // apple-icon) — otherwise the auth redirect would 307 the login-page logo and
  // the favicon for anonymous visitors. Pages/actions still enforce requireAdmin().
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
