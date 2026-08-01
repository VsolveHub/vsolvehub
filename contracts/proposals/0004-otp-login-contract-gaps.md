# Proposal 0004 — Authentication contract gaps found while building the OTP login UI

**Author:** Claude (frontend)
**Date:** 1 August 2026
**Contract version reviewed:** 1.2.0
**Status:** Accepted with changes — backend implementation pending
**Raised by:** FE-CLAUDE-01 (reusable OTP request/verify UI)
**Consumed by:** FE-CLAUDE-02 (Customer booking login/resume), FE-CLAUDE-03 (Partner `/apply/*`),
FE-CLAUDE-06 (Operations login)

The OTP request/verify flow is now built against the published contract and is integrable —
nothing here blocks it. These are the four places where the UI had to choose a local default or
author its own copy because the contract does not carry the value. Each one is currently correct
but silently coupled to a Django constant the frontend cannot see.

## Backend decision — 2 August 2026

- Publish `OtpIssued.code_length` and machine-readable throttle wait seconds.
- Keep backend-authored error codes in lowercase `snake_case`. Frontend recovery/localization tables
  must use those exact codes.
- Server `message` becomes safe fallback English copy. Product translations remain frontend-owned and
  keyed by stable error code; the server never leaks diagnostic/provider detail.
- Replace the current session read with a stable projection containing `user`, `active_role` and
  `session_expires_at`; anonymous state is `200` with `user: null`.
- M1 booking is login-first at the address boundary. Django will not persist anonymous address PII.
- Browser credential and CSRF transport is specified separately in proposal 0006.

---

## 1. `OtpIssued` does not publish the code length

### Problem

`OtpIssued` publishes `challenge_id`, `expires_in_seconds`, `resend_after_seconds` and
`development_code`, but not how many digits the code has. The verify screen needs it for three
things: the field label ("6-digit code"), the input's `maxLength`, and deciding when the Verify
button becomes enabled.

`backend/config/settings/base.py` sets `OTP_CODE_LENGTH = 6`. The frontend currently defaults to
`6` through an explicit `codeLength` option on `useOtpFlow`, so changing the Django setting would
silently break the client's validation and truncate a pasted code.

### Requested change

Add `code_length` to `OtpIssued`.

```json
{
  "challenge_id": "0f2b...",
  "expires_in_seconds": 300,
  "resend_after_seconds": 60,
  "code_length": 6,
  "development_code": null
}
```

### User-visible behavior once published

The label, `maxLength` and submit-enablement all follow the server. Until then they follow a
documented client default.

---

## 2. A throttled OTP request does not say how long to wait

### Problem

`OtpRequestView` raises DRF `Throttled(wait=exc.retry_after_seconds)`, so Django knows the wait.
The envelope produced by `common/errors/handler.py` does not carry it in a machine-readable field —
it survives only inside the English `details` string ("Expected available in N seconds") and the
`Retry-After` header, neither of which the typed client exposes.

Consequence: after a `429`, the UI cannot restart the resend countdown honestly. It currently shows
the rate-limit message and leaves the previously issued cooldown running; if the `429` arrives on
the *first* request for a number there is no cooldown to run, so the Resend control is enabled
again immediately and the next attempt is also rejected.

### Requested change

Add `retry_after_seconds` to the error envelope's `details` for throttled responses (or as a
first-class field on `ApiErrorDetail`, which would serve every rate-limited endpoint).

```json
{
  "error": {
    "code": "throttled",
    "message": "Too many code requests for this number.",
    "details": { "retry_after_seconds": 47 },
    "retryable": true,
    "request_id": "req_..."
  }
}
```

### User-visible behavior once published

"Resend code in 0:47" instead of a control that looks available and is not.

---

## 3. The error envelope's `message` is the HTTP reason phrase, not customer-safe copy

### Problem

This is the widest of the four and affects every screen, not only login.

`common/errors/handler.py` sets:

```python
message = HTTPStatus(response_status).phrase
```

So a rejected OTP returns `"message": "Bad Request"` and a throttled one returns
`"message": "Too Many Requests"`.

`describeError()` in `@vsolve/query` prefers the server's message on the documented assumption
that it is customer-safe by contract. It is not, so the generic path would render **"Bad Request.
You have not been charged."** to someone trying to log in.

The OTP flow therefore authors its own copy in `describeOtpFailure()` and does **not** use
`describeError()`. That is the right call for authentication — Django deliberately refuses to say
whether a code was wrong, expired or locked, so the copy has to cover all three without leaking
which — but it must not become the pattern every feature copies.

### Requested change

Either:

- **(a)** populate `message` with the customer-safe sentence the error envelope's contract already
  promises, per code; or
- **(b)** state explicitly in the contract that `message` is diagnostic and the frontend owns all
  customer copy, keyed by `code`.

(a) is preferred: it keeps one source of truth and makes Telugu/Hindi a server-side catalogue.

---

## 4. Error `code` casing does not match the documented recovery table

### Problem

Django emits DRF codes: `invalid_otp`, `throttled`, `validation_error`, `otp_unavailable`.
`RECOVERY_BY_CODE` in `packages/api-client/src/errors.ts` is keyed on `OTP_INVALID`,
`VALIDATION_ERROR`, `SESSION_EXPIRED` and so on. **No key currently matches**, so every domain
error silently falls through to `defaultRecoveryForStatus(status)`.

Status-based classification is a reasonable fallback and nothing is broken today, but the domain
table is dead code, which means a future `SLOT_NO_LONGER_AVAILABLE` → `choose_again` mapping will
also quietly not apply.

### Requested change

Fix the casing on one side and add a contract test that asserts the published code set. The
frontend prefers Django's `snake_case` staying as-is and the client table being rekeyed, since the
codes are backend-authored — but either direction works as long as it is the *contract* that
decides.

### Related

Whichever direction is chosen, `details` shape also matters: Django serialises each DRF
`ErrorDetail` as `{"message": ..., "code": ...}`, so validation failures arrive as
`{"phone_number": [{"message": "...", "code": "invalid"}]}` rather than a list of strings.
`ApiRequestError.fieldErrors` now reads both shapes (this was fixed under FE-CLAUDE-01); the
contract should document which one is canonical.

---

## 5. There is no anonymous-safe way to ask "is anyone signed in?"

**Raised by:** FE-CLAUDE-02 (Customer booking login/resume step)

### Problem

`GET /api/v1/auth/session/` is `IsAuthenticated`, so an anonymous caller gets `401`. That is the
only signal available, and every screen that must decide whether to show a login prompt has to
provoke an authentication failure to learn the answer.

Two consequences:

- The API client's `onUnauthorized` hook fires and broadcasts `session.logout` to sibling tabs,
  clearing their query caches. It is harmless today (the session cookie is per-origin, so a 401
  here means no tab has a session), but it is a read with a side effect.
- "Not logged in" and "session expired" are indistinguishable, so a screen cannot word the two
  differently without guessing.

### Requested change

Make the endpoint `AllowAny` and answer `200` with an explicit null user:

```json
{ "user": null, "session_expires_at": null }
```

Keep `401` meaning what it should: a session that *was* presented and is no longer valid.

### User-visible behavior once published

A returning customer is never asked to log in because a probe failed, and an expired session can
say "your session ended" rather than the same words as "you have not logged in yet".

---

## 6. The booking sequence assumes an anonymous customer can configure a booking; the contract does not allow it

**Raised by:** FE-CLAUDE-02

### Problem

`apps/customer/features/booking/model/stages.ts` documents the M1 order as
`address → scope → window → review → login → …`, on the stated basis that "a logged-out customer
configures and reviews freely, and authenticates only when the next action needs a server cart".

The published contract does not support that. `GET/POST /api/v1/addresses/` is `IsAuthenticated`,
and `address` is the **first** stage — so the very first thing the customer is asked for requires a
session. `POST /api/v1/quotes/` and `POST /api/v1/checkouts/` are also `IsAuthenticated`; only the
cart, reverse geocode and serviceability check are `AllowAny`.

The frontend has resolved this without reordering the documented sequence: login is implemented as
an **interrupt** raised by whichever stage first needs a session, which returns the customer to
exactly where they were. Today that is the address stage, so in practice an anonymous customer logs
in first.

### Decision needed

Either:

- **(a)** confirm that M1 booking is login-first, and correct the sequence documentation; or
- **(b)** publish an anonymous address path (the anonymous cart already exists), so the stated
  "configure freely, authenticate at the cart" journey is actually reachable.

This is a product decision, not a defect — but the plan and the contract currently disagree, and
the frontend cannot resolve that on its own.

---

## Still outstanding from earlier proposals

- **Active role switch (P-FE-01 / D2).** `switch_active_role` exists in
  `apps/identity/services.py` and `RoleSwitchSerializer` is defined, but the generated client at
  `1.2.0` has no role-switch path. Login, logout and role *inspection* work; the Partner and
  Operations shells cannot select an active role. No frontend role-switch UI has been built.
