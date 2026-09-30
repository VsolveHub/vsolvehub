# Commands

Run from the folder shown. Everything here is safe to allow when the assistant asks.

## Mobile (from `frontend/`)

| Command | What it does |
|---|---|
| `pnpm install` | install / link all workspace packages |
| `pnpm --filter partner-mobile start` | start Expo for Partner (`w` = browser, `a` = Android emulator, QR = phone) |
| `pnpm --filter customer-mobile start` | same for Customer |
| `pnpm --filter <pkg> lint` | ESLint (`partner-mobile`, `customer-mobile`, `@vsolve/mobile-core`, `@vsolve/mobile-ui`) |
| `pnpm --filter <pkg> typecheck` | TypeScript |
| `pnpm --filter <pkg> test` | Jest |
| `pnpm contract:generate` | regenerate `@vsolve/api-client` types from the OpenAPI file |
| `pnpm exec vitest run packages/api-client` | api-client tests (bearer mode) |
| `pnpm lint; pnpm typecheck` | web checks: must still pass after shared-file edits |

## EAS (from `frontend/mobile/apps/<app>/`)

| Command | What it does |
|---|---|
| `eas init` | link the app to the Expo project (once) |
| `eas build --profile development --platform android --no-wait` | queue a dev build (also `ios`, `all`) |
| `eas build --profile preview --platform all --no-wait` | queue a tester build (staging API) |
| `eas build:list --limit 5` | see queued/finished builds |
| `eas device:create` | register an iPhone for dev/preview builds |
| `eas credentials` | push keys, signing |
| `eas update --channel <name> --message "…"` | over-the-air JS update |
| `eas submit --profile production --platform <p> --latest` | upload to the stores |

## Backend (from `backend/`)

| Command | What it does |
|---|---|
| `.\.venv\Scripts\python.exe manage.py makemigrations mobile` | create the mobile migration |
| `.\.venv\Scripts\python.exe manage.py migrate` | apply migrations |
| `.\.venv\Scripts\python.exe -m pytest tests/mobile -q` | mobile backend tests |
| `.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate` | regenerate the API contract |
| `.\scripts\quality-static.cmd` | ruff, mypy, migration check, contract validation |
| `.\scripts\server.cmd` / `worker.cmd` / `beat.cmd` | run the backend |

## Git

```powershell
git add <explicit paths only>
git commit -m "<message from the phase file>"
git push -u origin mobile/v1
```
