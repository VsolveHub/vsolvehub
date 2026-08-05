# 4. Fail-closed provider selection

- Status: Accepted
- Date: 2026-07-30

## Context

Several capabilities have both a real implementation and a development stand-in: payments
(`razorpay` against `fake`), document storage (`supabase` against `unconfigured`), OTP delivery
(a real sender against `development`, which exposes the code), and geocoding (`nominatim` against
`unconfigured`).

The convenient pattern is to select the real provider when its credentials are present and quietly
fall back to the stand-in when they are not. That pattern fails in the worst possible direction.
A missing or mistyped production credential does not surface as an error; it surfaces as a system
that boots normally and behaves plausibly while taking no money, storing no KYC documents, and
printing one-time passcodes into a response body that anyone can read. The failure is discovered
by its consequences, days later, and every request served in between is a real customer.

The severity is asymmetric. A deployment that refuses to start is an outage measured in minutes
and visible to exactly the person who caused it. A deployment that silently runs on development
providers is a security and financial incident.

## Decision

Provider selection is **explicit**. Each capability reads a named provider setting —
`PAYMENT_PROVIDER`, `DOCUMENT_STORAGE_PROVIDER`, `OTP_PROVIDER`, `GEOCODING_PROVIDER` — and the
adapter is chosen from that name. Absent credentials never select a provider; they are a
misconfiguration of the provider that was named.

`config.settings.production` validates the resulting configuration at import time and raises
`ImproperlyConfigured` when a real provider is required and not properly configured. It requires
`PAYMENT_PROVIDER` to be `razorpay` with server credentials present and a webhook secret of at
least 32 characters, `DOCUMENT_STORAGE_PROVIDER` to be `supabase` over HTTPS with a service-role
key, a configured `GEOCODING_PROVIDER` with a contactable `GEOCODING_USER_AGENT`, and it forbids
development OTP delivery or exposure outright.

The development stand-ins remain available in `local`, `test` and `integration` settings, where
they are selected deliberately by name.

## Consequences

A production deployment with an incomplete configuration **does not start**. This is the intended
behaviour and the point of the decision: the failure is loud, immediate, and attributable to the
deploy that caused it.

There is no silent fallback to a development provider in production, and none may be added. A
future capability with a development stand-in inherits this obligation — it names its provider
explicitly and adds its own production guard.

The cost is deployment friction. Every new provider-backed capability adds required configuration,
and a first deploy to a new environment will typically fail two or three times before the variable
set is complete. That is the price paid up front instead of in an incident, and
`backend/.env.example` exists to keep it short.
