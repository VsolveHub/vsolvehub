# Vsolve Hub Agent Rules

## Architecture

- Django/DRF is the only business backend and database migration authority.
- PostgreSQL is the system of record; Redis is ephemeral coordination/cache infrastructure.
- Customer, Partner and the existing `admin` application use Next.js App Router in Milestone 1.
- Interactive authenticated workspaces use React client components and TanStack Query.
- `frontend/apps/admin` is the physical application name; its product label is Operations. Do not
  create `frontend/apps/operations` or perform a Vite/framework migration in Milestone 1.
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

- `frontend/apps/**`
- `frontend/packages/ui/**`
- `frontend/packages/query/**`
- `frontend/packages/api-client/**`
- `frontend/packages/testing/**`
- `contracts/proposals/**`

Claude may document a required endpoint, example payload and user-visible error in
`contracts/proposals/**`. Codex reviews the proposal, implements the Django endpoint and publishes
the generated contract in `contracts/openapi/v1.yaml`. Neither agent hand-edits generated clients or
the generated OpenAPI document.

Do not edit the other agent’s owned paths. Root/shared-file changes require an explicit integration
task.

### Commercial M2 exception — resolved 11 August 2026

The split above is the **M1 record**. For commercial M2 (workforce and project services,
`A3_TIME_BLOCK` + `A5_CUSTOM_PROJECT`) the owner directed that **Claude runs every session**,
including `backend/**` and `contracts/openapi/**`. That is how P1–P3 and the Wave C0 contract were
actually built. The three concurrent M2 columns and their owned paths are defined in
`Django_Next.js_Plan/M2/frontend-execution-plan.md` §3 and `backend-session.md`; those files are the
live ownership rule for M2 work. To be revisited when M2 closes.

### Customer-booked visit revamp — owner directive 25 August 2026

For the milestone tracked in root `task.md`, the current ownership split supersedes the historical
commercial-M2 session rule above:

- **Codex** owns `backend/**`, `contracts/openapi/**`, backend tests and contract publication.
- **Antigravity** owns `frontend/**`, frontend tests and UI integration.
- **Claude** has no further implementation ownership. Its completed `M2-revamp` changes are
  historical input to audit and integrate, not authorization for another Claude session.

Codex may inspect the whole repository for integration context but implements the backend side.
Antigravity consumes the generated OpenAPI client and must not hand-edit generated client files.

#### Frontend reassigned to Claude — owner directive, superseding the two lines above

The owner moved `frontend/**` from Antigravity to Claude for the M2 screen build.
Antigravity's in-flight work was committed first at `4de73ef` so none of it was lost —
that commit is its work, unreviewed, not Claude's.

- **Claude** owns `frontend/**`, `contracts/proposals/**`, frontend tests and UI integration.
- **Codex** keeps `backend/**` and `contracts/openapi/**` unchanged.
- Antigravity has no active frontend assignment under this directive.

Both agents are working the same tree concurrently. Two practical rules learned the hard
way here: never `git add -A` (it swept six of Codex's live backend edits into a frontend
commit, which had to be split back out), and stage explicit paths only.

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

### Who runs the tests — owner-run, effective 12 August 2026

**Agents do not execute test cases.** Not a suite, not a focused module, not one test. Write the
tests — every rule above still applies and an unwritten test is a gap you must report — then stop.
The owner runs and verifies all of them manually.

| Agents run | Agents never run |
|---|---|
| `backend\scripts\quality-static.cmd` (ruff, strict mypy, `makemigrations --check`, `spectacular --validate`, contract-drift check) | `backend\scripts\quality.cmd` — **its fourth step is pytest**, and it exits on failure, so a red test also skips the four checks after it |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | `pytest`, `vitest`, Playwright, or any command whose purpose is running a test |

Report work as **"built — owner verification pending"** and end the report with the test files you
wrote and the exact commands to run them. Never state "tests pass", "N/N green" or "verified" for a
run that did not happen.

### Test execution exception — customer-booked visit revamp, 25 August 2026

The owner explicitly authorized agents to execute tests for the milestone tracked in root
`task.md`. This exception overrides the owner-run-only rule above for that milestone only:

- Codex may run focused and full backend pytest suites and `backend\scripts\quality.cmd`.
- Antigravity may run frontend Vitest and Playwright suites in addition to lint, typecheck and
  build.
- Report the exact commands and real results. Never claim a test passed unless that command ran.
- Outside this milestone, the owner-run-only rule remains in force.

### Razorpay sandbox directive — customer-booked visit revamp, 25 August 2026

- Use Razorpay **test mode** for manual/staging payment integration and smoke checks in this
  milestone. Automated suites continue to use deterministic provider fakes and must not call an
  external payment network.
- The credential values supplied in chat are treated as exposed and must be rotated before use.
  Store only the replacement values in local/staging environment or secret management.
- Never place Razorpay key secrets or webhook secrets in source, `task.md`, `AGENTS.md`, frontend
  environment files, fixtures, command output or logs.
- Configure a separate `PAYMENT_WEBHOOK_SECRET`; a Razorpay key id/secret pair alone is not enough
  to verify provider callbacks.
- Reuse the existing Django Razorpay adapter and the browser Checkout handoff. Do not add a
  Razorpay SDK dependency unless the existing adapter demonstrably cannot support an approved
  operation and an ADR approves the change.
- Razorpay collections and RazorpayX payouts use separate credentials and permissions.

## Git and destructive operations

- Do not delete `.git`.
- Do not reset, discard or overwrite user changes.
- Do not commit secrets, `.env` files, databases, media or virtual environments.
- Use separate branches/worktrees for Codex and Claude once the current dirty tree is safely
  checkpointed by the user.
- The M2 branch embargo is **spent**. Commercial M2 (workforce/project, `A3_TIME_BLOCK` +
  `A5_CUSTOM_PROJECT`) was merged into `main` on 23 August 2026 on the owner's explicit
  instruction, so `main` now carries M1 and M2 together. Do not re-apply the old rule or warn
  about it.
- `main` is no longer an M1-only acceptance build. If M1 has to ship on its own, cut a release
  branch from `d1f443a` — the last commit before the M2 merge.
- Still branch for feature work rather than committing to `main` directly, and still confirm with
  the owner before pushing to `main`. That is ordinary caution now, not an M2 prohibition.
