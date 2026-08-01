/**
 * The CSRF token, held in memory for the life of the tab.
 *
 * ## Why not `document.cookie`
 *
 * The client used to read a `csrftoken` cookie. That cannot work in production:
 * Django sets the cookie on the API origin, `HttpOnly` and `Secure`, and the
 * three frontends are sibling subdomains that can neither read it nor be sent it
 * by `document.cookie`. Every authenticated mutation would have failed the first
 * time it ran outside localhost, and no unit or MSW test would have noticed —
 * which is exactly what proposal 0006 was written about.
 *
 * Contract 1.3.0 publishes `GET /api/v1/auth/csrf/` returning
 * `{ "csrf_token": "..." }`. The token lives here, in a module variable, and
 * goes out as `X-CSRFToken`. It is deliberately **never** written to
 * `localStorage` or `sessionStorage`: a token readable by any script on the
 * origin outlives the tab and survives logout, which is the whole class of bug
 * the HttpOnly session cookie exists to avoid.
 *
 * ## Rotation
 *
 * Django rotates the token when the session rotates — on OTP login, on logout
 * and on role switch. Rather than making every caller remember that, the store
 * exposes `invalidate()` and the client calls it on any response that reports
 * `csrf_failed`, then retries the request once with a freshly bootstrapped
 * token. A person mid-form does not see a failure they cannot act on.
 */

/** Requests in flight share one bootstrap rather than starting a stampede. */
let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

export interface CsrfStore {
  /** The current token, or null when nothing has been bootstrapped yet. */
  peek: () => string | null;
  /** Returns the cached token, bootstrapping once if there is none. */
  ensure: () => Promise<string | null>;
  /** Drops the token so the next unsafe request bootstraps a new one. */
  invalidate: () => void;
  /** Replaces the token from a response that carries a fresh one. */
  set: (token: string | null) => void;
}

/**
 * Creates the store for one API origin.
 *
 * `bootstrap` is injected rather than imported so this module never depends on
 * the client that uses it, and so tests can drive rotation without a network.
 */
export function createCsrfStore(bootstrap: () => Promise<string | null>): CsrfStore {
  return {
    peek: () => cached,

    ensure: async () => {
      if (cached) return cached;
      // Concurrent mutations at startup — a form submit racing a background
      // refetch — must not each fetch their own token.
      inFlight ??= bootstrap()
        .then((token) => {
          cached = token;
          return token;
        })
        .catch(() => null)
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },

    invalidate: () => {
      cached = null;
    },

    set: (token) => {
      cached = token;
    },
  };
}

/** Test seam: forgets the process-wide token between cases. */
export function resetCsrfStateForTests(): void {
  cached = null;
  inFlight = null;
}
