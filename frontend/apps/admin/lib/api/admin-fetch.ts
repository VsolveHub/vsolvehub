"use client";

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

let inMemoryCsrfToken: string | null = null;

async function getOrFetchCsrfToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh) {
    const cookieToken = getCsrfToken();
    if (cookieToken) {
      inMemoryCsrfToken = cookieToken;
      return cookieToken;
    }
    if (inMemoryCsrfToken) {
      return inMemoryCsrfToken;
    }
  }

  try {
    const res = await fetch("/api/v1/auth/csrf/", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data?.csrf_token) {
        inMemoryCsrfToken = data.csrf_token;
        return data.csrf_token;
      }
    }
  } catch {
    // ignore
  }
  return getCsrfToken();
}

export interface AdminFetchOptions extends RequestInit {
  data?: unknown;
  _isRetry?: boolean;
}

export type AdminFetchResponse<T> = T & {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
};

export async function adminFetch<T = any>(
  endpoint: string,
  options: AdminFetchOptions = {}
): Promise<AdminFetchResponse<T>> {
  const { data, headers = {}, _isRetry, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = await getOrFetchCsrfToken(_isRetry);
    if (csrfToken) {
      reqHeaders["X-CSRFToken"] = csrfToken;
    }
  }

  let body: BodyInit | undefined = rest.body ?? undefined;
  if (data !== undefined && !body) {
    body = JSON.stringify(data);
  } else if (
    body !== undefined &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer)
  ) {
    body = JSON.stringify(body);
  }

  // Ensure Content-Type is application/json for JSON payloads and mutating methods,
  // unless explicitly specified or body is FormData
  if (!reqHeaders["Content-Type"] && !(body instanceof FormData)) {
    if (body !== undefined || ["POST", "PUT", "PATCH"].includes(method)) {
      reqHeaders["Content-Type"] = "application/json";
    }
  }

  // Ensure relative URLs are used so Next.js rewrites proxy them to Django
  const url = endpoint.startsWith("http://localhost:8000")
    ? endpoint.replace("http://localhost:8000", "")
    : endpoint;

  const res = await fetch(url, {
    ...rest,
    method,
    headers: reqHeaders,
    credentials: "include",
    body,
  });

  if (!res.ok) {
    // If CSRF token expired or missing (403), auto-refresh token and retry once
    if (res.status === 403 && !_isRetry && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      const freshToken = await getOrFetchCsrfToken(true);
      if (freshToken) {
        return adminFetch<T>(endpoint, {
          ...options,
          _isRetry: true,
          headers: {
            ...headers,
            "X-CSRFToken": freshToken,
          },
        });
      }
    }

    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (typeof errJson.detail === "string") {
        errorDetail = errJson.detail;
      } else if (typeof errJson.error === "string") {
        errorDetail = errJson.error;
      } else if (errJson.error && typeof errJson.error === "object" && typeof errJson.error.message === "string") {
        errorDetail = errJson.error.message;
      } else if (typeof errJson.message === "string") {
        errorDetail = errJson.message;
      } else {
        errorDetail = JSON.stringify(errJson);
      }
    } catch {
      try {
        const text = await res.text();
        if (text) errorDetail = text;
      } catch {
        // ignore
      }
    }
    throw new Error(errorDetail);
  }

  // If 204 No Content
  if (res.status === 204) {
    const emptyObj = {} as any;
    Object.defineProperties(emptyObj, {
      ok: { value: true, enumerable: false, writable: true },
      status: { value: 204, enumerable: false, writable: true },
      json: { value: () => Promise.resolve({}), enumerable: false, writable: true },
    });
    return emptyObj;
  }

  const parsed = await res.json();
  if (parsed && typeof parsed === "object") {
    Object.defineProperties(parsed, {
      ok: { value: res.ok, enumerable: false, writable: true },
      status: { value: res.status, enumerable: false, writable: true },
      json: { value: () => Promise.resolve(parsed), enumerable: false, writable: true },
    });
  }

  return parsed as AdminFetchResponse<T>;
}
