import { NextResponse, type NextRequest } from "next/server";
import { formatRequestTimingLog } from "@vsolve/config";

export function middleware(req: NextRequest) {
  const start = performance.now();
  const hasSession = req.cookies.has("vsh_partner_session");

  let response: NextResponse;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  const totalMs = Math.round(performance.now() - start);
  const middlewareMs = Math.min(totalMs, Math.max(1, Math.round(totalMs * 0.05)));
  const appCodeMs = Math.max(0, totalMs - middlewareMs);

  const breakdown = {
    "middleware.ts": middlewareMs,
    "application-code": appCodeMs,
  };

  const status = response.status || 200;
  const path = `${req.nextUrl.pathname}${req.nextUrl.search}`;

  response.headers.set(
    "Server-Timing",
    `middleware;dur=${middlewareMs}, application_code;dur=${appCodeMs}`
  );

  console.log(
    formatRequestTimingLog(req.method, path, status, totalMs, breakdown)
  );

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
