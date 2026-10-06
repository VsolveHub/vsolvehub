# Phase 5 — API contract and shared client

## Prompt

```text
Phase 5 of the Vsolve Hub mobile build. Read first: frontend/mobile/AGENTS.md §1,
frontend/mobile/guide/05-backend.md §6, §7 and §8, frontend/packages/api-client/src/client.ts
fully, frontend/packages/query/src/index.ts and package.json.

1. Contract: bump SPECTACULAR_SETTINGS["VERSION"] one minor version in
   backend/config/settings/base.py, regenerate contracts/openapi/v1.yaml with the spectacular
   command (guide 10), and add a CHANGELOG entry in contracts/openapi/CHANGELOG.md in the existing
   style listing: POST /auth/mobile/otp/verify/, POST /mobile/devices/,
   POST /mobile/devices/unregister/, GET /mobile/app-config/.
2. From frontend/: pnpm contract:generate (regenerates the generated schema; never hand-edit it).
3. @vsolve/api-client: add the opt-in bearer mode exactly as guide 05 §6. Cookie mode must be
   unchanged. Add tests for bearer mode next to the existing client tests.
4. @vsolve/query: add the "./native" export and src/native.ts exactly as guide 05 §7, and mark
   react-dom optional.
5. Run and paste output:
   backend: .\scripts\quality-static.cmd
   frontend: pnpm contract:check ; pnpm exec vitest run packages/api-client packages/query ;
   pnpm lint ; pnpm typecheck
```

## TODO

- [x] contract regenerated, version bumped, changelog entry
- [x] generated TS client updated
- [x] bearer mode + tests (cookie mode untouched)
- [x] `@vsolve/query/native` entry
- [x] all checks pass (web unaffected)

## Done when

- [x] the output shows all checks green

## Commit

```powershell
git add backend/config/settings/base.py contracts/openapi frontend/packages/api-client frontend/packages/query
git commit -m "feat(api-client): bearer mode and native query entry for mobile apps"
```

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** OpenAPI 1.67.0 contract updated with changelog, `@vsolve/api-client` bearer mode implemented and tested without affecting cookie mode, and `@vsolve/query/native` exported.
