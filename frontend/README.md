# VSolveHub Frontend

Next.js App Router workspace for Customer, Partner and Operations.

## Setup

```powershell
pnpm.cmd install
Copy-Item .env.example .env.local
```

Local defaults expect Django at `http://localhost:8000`.

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
pnpm.cmd --filter @vsolve/api-client generate:check
```

That check is expected to fail until the backend publishes the next versioned OpenAPI
contract and the generated TypeScript file is refreshed.
