# Proposal 0010 — Expose the `Date` response header so browser countdowns use the server's clock

**Author:** Claude (FE-09 frontend integration)
**Date:** 3 August 2026
**Verified against:** OpenAPI 1.10.0 and `backend/config/settings/base.py`
**Status:** Implemented in the backend — published in OpenAPI 1.11.0. Frontend acceptance (§4) is the
one remaining item and belongs to the FE-09 follow-up.
**Consuming applications:** Customer, Partner, Operations — every countdown in the product
**Severity:** This is a live defect, not a gap. It affects deployed behaviour today.

## Problem

Every deadline this product shows is measured against `serverClock`, which the shared API client
calibrates from the HTTP `Date` response header:

```ts
const dateHeader = response.headers.get("date");
if (dateHeader) {
  const serverTimeMs = Date.parse(dateHeader);
  if (Number.isFinite(serverTimeMs)) {
    serverClock.record(serverTimeMs, sentAtMs, receivedAtMs, "date_header");
  }
}
```

**In a browser, `response.headers.get("date")` returns `null` for every one of these calls.**

`Date` is not a CORS-safelisted response header. The safelist is `Cache-Control`,
`Content-Language`, `Content-Length`, `Content-Type`, `Expires`, `Last-Modified` and `Pragma`;
anything else requires the server to name it in `Access-Control-Expose-Headers`. The frontends are
served from a different origin to the API — that separation is the whole subject of proposal 0006 —
and `backend/config/settings/base.py` sets no `CORS_EXPOSE_HEADERS`:

```python
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
CORS_URLS_REGEX = r"^/api/.*$"
```

`django-cors-headers` defaults `CORS_EXPOSE_HEADERS` to an empty list, so the header is stripped from
the browser's view of the response.

The consequence: `serverClock.isCalibrated` is `false` for the entire session, `offsetMs` stays `0`,
and every countdown silently measures against the **device** clock.

### How this was found, and why it had not been noticed

A Playwright test asserted that an offer expiring at `10:00:00Z`, on a response dated `09:00:00Z`,
shows about an hour remaining. It rendered `4:35:02` — the machine's own clock, off by hours from
the fixture. Nothing failed, nothing logged, and the number looked entirely plausible.

That is the shape of this bug everywhere. There is no error state, no console warning and no visual
difference between a calibrated countdown and a wrong one.

### What it affects

Every timer in the product, all of which are operationally or financially meaningful:

| Countdown | Consequence of a skewed device clock |
| --- | --- |
| Partner offer expiry | A live offer reads as expired. The Partner does not tap Accept and loses the job. |
| Partner 120-second undo window | The Partner believes the window has closed and stops trying to undo a commitment they did not want — or believes it is open when it has closed. |
| Booking Group `expires_at` | A customer sees time remaining on a group the server has already expired. |
| OTP expiry and resend cooldown | A code shows as expired before it is. |
| Payment hold deadlines (BE-08) | Same class, with money attached. |

A device clock minutes out is not exotic. Phones that have been off, devices with a wrong timezone,
machines with a broken NTP client, and users who set the clock deliberately are all ordinary.

`server-clock.ts` was written specifically to prevent this — *"a device clock that is minutes fast or
slow would show a partner an offer that looks alive when the server has already expired it"* — and
the mechanism has never once run in a browser.

## Requested contract

Expose the header.

```python
CORS_EXPOSE_HEADERS = ["Date"]
```

Nothing else changes. Django already sends `Date` on every response, as required by RFC 9110; this
only makes it readable by the caller that needs it.

### Why the frontend's own fix does not close this

FE-09 changed `unwrap()` to calibrate from any response body carrying `server_now`, which several
endpoints publish (`BookingGroup`, `FulfilmentPlanSet`, `GroupQuote`, `BookingWindows`). That fixes
calibration for a session that touches one of those, and it is worth having regardless because
`server_now` is millisecond-precise where the header is second-precise.

It does not make the header redundant:

- A session that never touches a `server_now` endpoint is still uncalibrated. The Partner app is
  exactly this case — `Offer` publishes no `server_now`, so a Partner who opens the app straight to
  their inbox has no calibration at all, and the 120-second undo window is measured on the device
  clock.
- Calibration decays. `ServerClock` ages a sample out after five minutes so it tracks drift, and the
  header is the only source that refreshes on *every* response.
- A new endpoint added later inherits calibration for free from the header. Requiring `server_now`
  on each one is a rule somebody has to remember.

### Related, and cheaper to do at the same time

`Offer` publishes no `server_now`, which is the single worst gap because it carries the shortest and
most consequential countdown in the product. Proposal 0009 §4 requests the field; if the header is
exposed, that request drops from "needed" to "nice, for millisecond precision".

## Acceptance criteria

1. `CORS_EXPOSE_HEADERS` includes `Date` in base settings, and production start-up validates it the
   way it already validates `CORS_ALLOWED_ORIGINS`.
2. A cross-origin `fetch` from an allowed frontend origin can read `response.headers.get("date")`.
3. Backend test: assert `Access-Control-Expose-Headers` contains `Date` on a credentialed
   cross-origin response, alongside the existing CORS assertions.
4. Frontend acceptance: with the device clock deliberately set an hour fast, a Partner offer expiring
   in two minutes shows about two minutes — not a negative or a wildly wrong value. This is
   assertable in Playwright today by overriding `Date` in the page context.
5. `serverClock.isCalibrated` is `true` after the first API response in a real browser session.

## Backend resolution — 3 August 2026

Implemented by Claude in the reassigned backend lane. Published as OpenAPI **1.11.0**.

### What changed

| Change | File |
| --- | --- |
| `CORS_EXPOSE_HEADERS = env.list("CORS_EXPOSE_HEADERS", default=["Date"])` | `backend/config/settings/base.py` |
| Production start-up fails when a deployment drops `Date` from the exposed list | `backend/config/settings/production.py` |
| `Date` documented as an exposed header for local/deployed environments | `backend/.env.example` |
| `server_now` added to the `Offer` projection and the offer page envelope | `backend/apps/assignments/serializers.py`, `backend/apps/assignments/views.py` |

The setting is environment-overridable rather than hard-coded so a deployment may expose additional
headers, and so the production guard is a real check instead of a restatement of a literal. Removing
`Date` is a fail-closed configuration error, not a silent degradation — which is precisely the
failure mode this proposal was filed about.

### Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| 1. `CORS_EXPOSE_HEADERS` includes `Date`; production validates it | `test_production_requires_date_to_stay_exposed` loads production settings with `CORS_EXPOSE_HEADERS=X-Request-Id` and asserts `ImproperlyConfigured`. `test_production_accepts_additional_exposed_headers_alongside_date` proves the guard does not forbid other headers. |
| 2. A cross-origin `fetch` can read `response.headers.get("date")` | `test_real_cross_origin_response_carries_a_readable_date_header` runs a real WSGI server via `live_server`, issues an HTTP request from `https://partner.example.test` and asserts both a parseable `Date` on the wire and `date` in the expose list. The Django test client cannot prove this: it never passes through a WSGI server, so it never writes a `Date` header at all. |
| 3. Backend test asserts `Access-Control-Expose-Headers` contains `Date` on a credentialed cross-origin response | `test_allowed_credentialed_origin_may_read_the_date_header` and `test_exposed_header_list_matches_date_case_insensitively`. `test_rejected_origin_receives_no_credentialed_cors_access` proves origin validation stays fail-closed on both the simple request and the preflight. |
| 4. Skewed-device-clock Partner countdown renders correctly in a browser | **Not backend-assertable.** This is the FE-09 follow-up and must be run as Playwright evidence against real Django. |
| 5. `serverClock.isCalibrated` is `true` after the first API response | Backend half is complete: the header is on the wire and readable. Frontend confirmation belongs with criterion 4. |

### On the `server_now` question

The proposal argued the header makes `Offer.server_now` "nice, rather than needed". It is published
anyway, for the reason the proposal itself gives: a Partner opening straight to their inbox is the
one session with no other calibration source, and it carries the two shortest deadlines in the
product. An empty inbox has no offer object to read a timestamp from, so the page envelope publishes
it too. It is defense in depth, not a substitute — the header remains the primary source because it
refreshes on every response and so tracks drift, which a per-endpoint field cannot.

Proposal 0009 §4 can now treat its `server_now` request as satisfied.

## Interim frontend behaviour

`unwrap()` now calibrates from `server_now` wherever an endpoint publishes it, so Customer booking
countdowns are correct as soon as a group is read. Partner offer countdowns remain device-clock based
until either this proposal or proposal 0009 §4 lands, and no screen claims a precision it does not
have — but no screen currently warns about it either, because a warning on every countdown would be
noise for a condition that is usually benign and is properly fixed here.
