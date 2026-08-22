# VSolveHub Frontend

Next.js App Router workspace for Customer, Partner and Operations.

## Setup

```powershell
pnpm.cmd install
```

No environment file is required. Every app falls back to `http://localhost:8000` for the API, and
Django's local settings already permit ports 3000, 3001 and 3002.

Next loads `.env.local` from **the app directory**, not from this workspace root, so a
`frontend/.env.local` is read by nothing. `.env.example` here documents the variables; to use one,
copy it into `apps/customer/`, `apps/partner/` or `apps/admin/`. The proxy setup — an empty
`NEXT_PUBLIC_API_BASE_URL` so the browser emits relative URLs that the dev rewrite forwards to
Django — is written out in [CONTRIBUTING.md §3d](../CONTRIBUTING.md), and is what makes the session
cookie first-party when testing through a tunnel.

## Run

```powershell
pnpm.cmd dev:customer
pnpm.cmd dev:partner
pnpm.cmd dev:admin
```

Default ports:

- Customer: `http://localhost:3000`
- Partner: `http://localhost:3001`
- Operations: `http://localhost:3002`

If Docker or another process is already using these ports, run the package script from
the app directory with a different `--port`.

## Quality

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

The generated API client is produced from `../contracts/openapi/v1.yaml`:

```powershell
pnpm.cmd contract:check          # or: pnpm.cmd --filter @vsolve/api-client generate:check
```

It passes at contract **1.39.0** as of 23 August 2026. When it fails, the committed client no
longer matches the contract: regenerate with `pnpm.cmd contract:generate` and commit the result.
Never hand-edit `v1.yaml` or `packages/api-client/src/generated/`.

Note that `pnpm typecheck` runs through turbo and will replay a cached pass over code that no
longer compiles. When a gate is deciding something, force a cold run:
`pnpm.cmd exec turbo run typecheck --force`.
