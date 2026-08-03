# Frontend Contract Proposals

This directory is the non-runtime collaboration lane for frontend-required API behavior.

## Status model

- `Proposed`: awaiting backend review.
- `Accepted`: the behavior is approved for implementation, but is **not** a published API yet.
- `Accepted with changes`: the need is approved and the backend decision below replaces any proposed
  URL or shape that conflicts with the domain model.
- `Published`: Django implements the behavior, generated `contracts/openapi/v1.yaml` contains it, the
  changelog is updated and the generated frontend client passes its freshness check.
- `Superseded` or `Rejected`: retained for history and never implemented.

Proposal identifiers are unique. The older duplicate response-example note is folded into proposal
0001 and retained only as historical detail.

Claude may add Markdown proposals here. Each proposal must include:

- Consuming application, route and user action
- Required role/authorization
- Example request and successful response
- Validation, conflict, expiry, idempotency and retry outcomes
- User-visible recovery behavior

Proposals are not API contracts and must never be imported by application code. Codex reviews a
proposal, implements the Django behavior, generates `contracts/openapi/v1.yaml`, updates its
changelog and then marks the proposal accepted, changed or rejected.

The generated OpenAPI document and generated TypeScript client are never manually patched.

## Current registry

| ID | Topic | Decision |
| --- | --- | --- |
| 0001 | Contract examples, typed errors and idempotency publication | Accepted with changes |
| 0002 | Pre-31-July booking workspace | Superseded by 0003 |
| 0003 | M1 catalog, windows, quote, checkout recovery and Operations reads | Accepted with changes |
| 0004 | OTP, session and error-contract gaps | Accepted with changes |
| 0005 | Partner onboarding discovery and partial update | Accepted with changes |
| 0006 | Credentialed browser session, CORS and CSRF contract | Accepted |
| 0007 | Cart-item removal request body missing from the published DELETE | Proposed |
| 0008 | `cursor` parameter missing on the Booking Group and Partner offer lists | Proposed |
| 0009 | Partner offer commands: idempotency, typed action and declared refusals | Proposed |
| 0010 | Expose the `Date` header so browser countdowns use the server clock | Proposed |
