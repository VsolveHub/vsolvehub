import "server-only";

import { cookies } from "next/headers";
import { createApiClient, type ApiClient } from "@vsolve/api-client";

import { SERVER_API_BASE_URL } from "./config";

/**
 * API client for session-scoped server-side reads.
 *
 * Forwards the incoming cookies so Django sees the caller's session, and opts
 * out of caching entirely — a response that varies by user must never enter a
 * shared cache.
 *
 * Reading cookies also marks the route dynamic, which is the behaviour we want:
 * a page showing someone's addresses must not be statically rendered.
 */
export async function createPrivateApi(): Promise<ApiClient> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  return createApiClient({
    baseUrl: SERVER_API_BASE_URL,
    fetch: (request) => {
      // The browser's `credentials: "include"` has no meaning server-side; the
      // cookie has to be attached by hand.
      if (cookieHeader) request.headers.set("cookie", cookieHeader);
      return fetch(request, { cache: "no-store" });
    },
  });
}
