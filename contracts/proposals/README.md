# Frontend Contract Proposals

This directory is the non-runtime collaboration lane for frontend-required API behavior.

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
