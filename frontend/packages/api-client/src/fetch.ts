import { createCsrfStore, type CsrfStore } from "./csrf";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_BOOTSTRAP_PATH = "/api/v1/auth/csrf/";

const csrfStores = new Map<string, CsrfStore>();

function getCsrfStoreForOrigin(baseUrl: string): CsrfStore {
  let store = csrfStores.get(baseUrl);
  if (!store) {
    store = createCsrfStore(async () => {
      const res = await fetch(`${baseUrl}${CSRF_BOOTSTRAP_PATH}`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) return null;
      try {
        const body: unknown = await res.json();
        const token = (body as { csrf_token?: unknown })?.csrf_token;
        return typeof token === "string" && token.length > 0 ? token : null;
      } catch {
        return null;
      }
    });
    csrfStores.set(baseUrl, store);
  }
  return store;
}

export interface ApiFetchOptions extends RequestInit {
  baseUrl?: string;
}

/**
 * Universal CSRF-aware fetch utility for endpoints across apps.
 *
 * Automatically handles:
 * - Origin resolution (relative or absolute)
 * - Session cookies with credentials: "include"
 * - CSRF bootstrap and X-CSRFToken header injection for mutating verbs
 * - 403 csrf_failed token rotation and automatic single retry
 */
export async function apiFetch(
  endpointOrUrl: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { baseUrl: customBaseUrl, ...fetchOptions } = options;
  const isAbsolute =
    endpointOrUrl.startsWith("http://") || endpointOrUrl.startsWith("https://");

  let fullUrl: string;
  let origin: string;

  if (isAbsolute) {
    fullUrl = endpointOrUrl;
    origin = new URL(endpointOrUrl).origin;
  } else {
    const base =
      customBaseUrl ||
      (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
      "http://localhost:8000";
    origin = base.replace(/\/+$/, "");
    const cleanPath = endpointOrUrl.startsWith("/")
      ? endpointOrUrl
      : `/${endpointOrUrl}`;
    fullUrl = `${origin}${cleanPath}`;
  }

  const method = (fetchOptions.method || "GET").toUpperCase();
  const isUnsafe = UNSAFE_METHODS.has(method);

  const headers = new Headers(fetchOptions.headers || {});
  if (
    isUnsafe &&
    !headers.has("Content-Type") &&
    fetchOptions.body &&
    typeof fetchOptions.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  const store = getCsrfStoreForOrigin(origin);

  if (isUnsafe) {
    const token = await store.ensure();
    if (token) {
      headers.set("X-CSRFToken", token);
    }
  }

  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
    credentials: "include",
  });

  if (response.status === 403 && isUnsafe) {
    const cloned = response.clone();
    try {
      const data = await cloned.json();
      const code = data?.error?.code || data?.code;
      const msg =
        data?.error?.details?.message ||
        data?.details?.message ||
        data?.error?.message ||
        "";
      if (code === "csrf_failed" || String(msg).includes("CSRF")) {
        store.invalidate();
        const freshToken = await store.ensure();
        if (freshToken) {
          headers.set("X-CSRFToken", freshToken);
          return await fetch(fullUrl, {
            ...fetchOptions,
            headers,
            credentials: "include",
          });
        }
      }
    } catch {
      // response wasn't JSON
    }
  }

  return response;
}
