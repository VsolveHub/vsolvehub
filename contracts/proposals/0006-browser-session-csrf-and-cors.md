# Proposal 0006 — Credentialed browser session, CORS and CSRF contract

**Author:** Codex (backend audit)
**Date:** 2 August 2026
**Status:** Accepted — backend implementation pending
**Consumed by:** Customer, Partner and Operations authenticated mutations

## Problem

All browser clients call Django with `credentials: "include"`, but the current backend does not emit
`Access-Control-Allow-Credentials: true`. The CSRF bootstrap sets an HttpOnly API-origin cookie while
the frontend attempts to read `document.cookie`; that cannot work from sibling production subdomains.
The endpoint also returns `{"status":"ok"}` while OpenAPI describes an empty response.

Unit/MSW tests do not exercise these browser controls, so they can pass while every authenticated
mutation fails in a real browser.

## Accepted contract

`GET /api/v1/auth/csrf/` is anonymous-safe and returns:

```json
{
  "csrf_token": "masked-token-value"
}
```

Rules:

- Django calls its CSRF token generator, sets the host-only CSRF cookie and returns the masked token.
- Frontends keep the returned token in memory only and send it as `X-CSRFToken` on unsafe requests.
- The token is fetched again after OTP login/session rotation and after a CSRF rejection.
- Session cookies remain HttpOnly and Secure in production. No session or CSRF value is stored in
  localStorage/sessionStorage or logged.
- `CORS_ALLOW_CREDENTIALS` is enabled with an explicit environment-owned origin allowlist. Wildcard
  credentialed origins are forbidden.
- `CSRF_TRUSTED_ORIGINS`, allowed hosts and site URLs are validated for Customer, Partner and
  Operations deployments.

## Required verification

One real-browser Playwright scenario runs against Django (not MSW): bootstrap CSRF, request/verify OTP
through the deterministic test adapter, create an authenticated mutation, rotate/revoke the session
and confirm the old browser state cannot mutate. Assert CORS headers, cookie flags, CSRF rejection and
successful recovery.
