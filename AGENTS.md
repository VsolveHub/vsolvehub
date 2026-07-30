# Vsolve Hub Agent Rules

## Architecture

- Django/DRF is the only business backend and database migration authority.
- PostgreSQL is the system of record; Redis is ephemeral coordination/cache infrastructure.
- Customer, Partner and the existing `admin` application use Next.js App Router in Milestone 1.
- Interactive authenticated workspaces use React client components and TanStack Query.
- `web/apps/admin` is the physical application name; its product label is Operations. Do not
  create `web/apps/operations` or perform a Vite/framework migration in Milestone 1.
- Frontends consume `contracts/openapi/v1.yaml` through generated clients.
- No frontend application may connect directly to PostgreSQL. Prisma is forbidden in the new
  implementation; legacy Prisma files are read-only migration reference until removal.
- Build a modular monolith. Do not introduce microservices without an approved ADR.

## Ownership

Codex owns:

- `backend/**`
- `infra/**`
- `contracts/openapi/**`
- `docs/adr/**`
- `docs/runbooks/**`

Claude owns:

- `web/apps/**`
- `web/packages/ui/**`
- `web/packages/query/**`
- `web/packages/api-client/**`
- `web/packages/testing/**`
- `contracts/proposals/**`

Claude may document a required endpoint, example payload and user-visible error in
`contracts/proposals/**`. Codex reviews the proposal, implements the Django endpoint and publishes
the generated contract in `contracts/openapi/v1.yaml`. Neither agent hand-edits generated clients or
the generated OpenAPI document.

Do not edit the other agent’s owned paths. Root/shared-file changes require an explicit integration
task.

## Python environment

- Use Python 3.13.
- Install every Python package into `backend/.venv`.
- Never install project requirements globally.
- Edit `backend/requirements/*.in`, then regenerate the hashed `.txt` lock files.
- Never hand-edit generated requirement lock files.

## Backend commands

Run from `backend`:

```powershell
.\scripts\bootstrap.cmd
.\scripts\quality.cmd
.\scripts\server.cmd
```

Generate and validate the API contract:

```powershell
.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate
```

Check migrations:

```powershell
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --noinput
```

## Quality rules

- Preserve `.git`, existing history and unrelated uncommitted work.
- Use explicit domain commands for business state changes.
- Keep views thin; put business invariants in domain services.
- Server calculates all prices and financial values in integer paise.
- State-changing commands must be authorized, idempotent where retryable and auditable.
- Database constraints protect invariants in addition to application validation.
- Never add hidden fallback prices, locations, providers, statuses or success states.
- Never log OTPs, session tokens, payment payloads or complete KYC data.
- External services sit behind adapters and have timeout/retry/reconciliation policies.
- Add a regression test with every bug fix.
- Maintain at least 85% backend branch-aware coverage.
- Ruff, strict MyPy, tests, migration checks and OpenAPI validation must pass before handoff.

## Git and destructive operations

- Do not delete `.git`.
- Do not reset, discard or overwrite user changes.
- Do not commit secrets, `.env` files, databases, media or virtual environments.
- Use separate branches/worktrees for Codex and Claude once the current dirty tree is safely
  checkpointed by the user.
