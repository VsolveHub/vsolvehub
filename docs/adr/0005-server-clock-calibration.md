# 5. Server clock calibration

- Status: Accepted
- Date: 2026-07-30

## Context

Several surfaces show a customer or partner a countdown against a server-owned deadline: the
window in which a partner may accept an offer, the window in which a customer may cancel without
a fee, and the expiry of a one-time passcode. The deadline itself is authoritative on the server —
it decides what has expired — but the countdown is rendered on a device.

A device clock is not trustworthy for this. Phone clocks drift, users set them manually, time
zones and daylight-saving transitions are applied inconsistently, and a device that is merely a
few minutes fast turns a live offer into a countdown that reads `00:00`. The partner sees an offer
that appears expired and does not act; the server, still holding the offer open, escalates it to
the next candidate. Nothing errors, and the fault is invisible from the backend.

Computing the countdown as `deadline - Date.now()` is therefore wrong by construction: it mixes a
server-authored instant with a client-authored one.

## Decision

Clients calibrate against the server clock rather than trusting their own. Every HTTP response
already carries a `Date` header; the client compares it to its local time on receipt, derives the
offset, and renders every countdown as `deadline - (localNow + offset)`.

For this to work from a browser on a different origin, the header must be readable by JavaScript,
which requires it to be exposed through CORS. `CORS_EXPOSE_HEADERS` defaults to `["Date"]` in
`config/settings/base.py`, and `config.settings.production` raises `ImproperlyConfigured` at
startup when `Date` is absent from that list.

## Consequences

Countdowns are correct on a device with a wrong clock, which is the case that matters — a device
with an accurate clock never needed calibration.

The `Date` header is now part of the platform's API contract, not an incidental HTTP detail. A
proxy, CDN or gateway that strips it, or a CORS configuration that stops exposing it, silently
breaks every countdown in both clients. The startup guard catches the settings mistake; it cannot
catch an edge proxy, so `Date` must be preserved in any infrastructure placed in front of the API.

Production startup fails when `CORS_EXPOSE_HEADERS` omits `Date`, consistent with the fail-closed
posture in ADR-0004.

Calibration corrects clock offset, not network latency. The offset derived from a response is off
by roughly the transit time, which is immaterial against deadlines measured in minutes and would
not be against deadlines measured in seconds. Any future sub-minute deadline needs a different
mechanism, not a tighter reading of this one.
